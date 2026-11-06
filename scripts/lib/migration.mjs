import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { formatApprovalPaths } from "./approval-paths.mjs";
import { inspectLegacyRecovery } from "./legacy-recovery.mjs";
import { validateManifest } from "./manifest.mjs";
import { collectManuscriptInventory } from "./manuscript.mjs";
import { validateProjectFiles, validateScopeCurrency } from "./project-files.mjs";
import {
  parseTrackerState,
  validateTracker,
  validateTrackerV3Markdown,
} from "./tracker.mjs";
import {
  computeScopeFingerprint,
  recordInventorySnapshot,
  recordScope,
  validateFullManuscriptScope,
} from "./scope.mjs";
import {
  createNoClobberVerified,
  writeAtomicVerified,
} from "./state-io.mjs";
import { utcDate } from "./time.mjs";

const APPROVAL_HEADERS = [
  "Approval ID",
  "Type",
  "Operation",
  "Scope ID",
  "Paths",
  "Status",
  "Reason",
  "Updated",
];

function validationError(label, result) {
  const details = result.errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("\n");
  return new Error(`${label} failed:\n${details}`);
}

function assertValid(label, result) {
  if (!result.valid) throw validationError(label, result);
}

async function createCurrentScope(projectRoot, manuscriptRoot, paths, timestamp) {
  let inventory;
  try {
    inventory = await collectManuscriptInventory(projectRoot, manuscriptRoot, paths);
  } catch (error) {
    throw new Error(`Cannot inventory manuscript_root: ${error.message}`);
  }

  if (inventory.files.length === 0) {
    throw new Error("No .md, .markdown, or .txt manuscript files found; no files were written");
  }

  const files = [];
  for (const entry of inventory.files) {
    const contents = await readFile(entry.absolute);
    files.push({
      path: entry.path,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }

  return {
    scope_id: "scope-v3-migration",
    description: "Migrated manuscript inventory; author confirmation is required before using this scope.",
    status: "proposed",
    files,
    excluded_files: inventory.excludedFiles,
    created_at: timestamp,
  };
}

function convertPendingAction(workflow, scopeId, timestamp) {
  if (workflow.current_stage === "complete") return null;
  const stage = workflow.stages.find((candidate) => candidate.name === workflow.current_stage);
  return {
    operation: workflow.current_stage,
    status: "awaiting_author",
    scope_id: scopeId,
    reason: `Migrated from stage ${workflow.current_stage} with status ${stage.status}; legacy reason: ${stage.reason ?? "none"}. Author confirmation is required before resuming.`,
    artifacts: [...(stage.artifacts ?? [])],
    updated_at: timestamp,
  };
}

function convertOverrides(workflow, currentScope, timestamp, existingIds) {
  let nextId = 1;
  return workflow.stages
    .filter((stage) => stage.override_reason)
    .map((stage) => {
      while (existingIds.has(`LEGACY-${String(nextId).padStart(3, "0")}`)) nextId += 1;
      const approvalId = `LEGACY-${String(nextId).padStart(3, "0")}`;
      existingIds.add(approvalId);
      nextId += 1;
      return {
        approval_id: approvalId,
        type: stage.name === "prose" ? "prose-override" : "gate-override",
        operation: stage.name,
        scope_id: currentScope.scope_id,
        paths: currentScope.files.map((file) => file.path),
        status: "deferred",
        reason: `${stage.override_reason} Author confirmation is required before the first resume after migration.`,
        updated_at: timestamp,
      };
    });
}

function splitTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  const cells = [];
  let value = "";
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      value += character;
    } else if (character === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function cleanCell(value = "") {
  return value.trim().replace(/^`([^`]*)`$/, "$1").trim();
}

function isSeparator(row) {
  return row?.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function tableCell(value) {
  return String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function renderApprovalRow(approval, headers) {
  const values = {
    "Approval ID": approval.approval_id,
    Type: approval.type,
    Operation: approval.operation,
    "Scope ID": approval.scope_id,
    Paths: formatApprovalPaths(approval.paths),
    Status: approval.status,
    Reason: approval.reason,
    Updated: approval.updated_at,
  };
  return `| ${headers.map((header) => tableCell(values[header])).join(" | ")} |`;
}

function emptyApprovalsSection(approvals) {
  return [
    "## Approvals",
    "",
    "Allowed statuses: `approved`, `deferred`, `cancelled`, `superseded`.",
    "",
    `| ${APPROVAL_HEADERS.join(" | ")} |`,
    `|${APPROVAL_HEADERS.map(() => "---").join("|")}|`,
    ...approvals.map((approval) => renderApprovalRow(approval, APPROVAL_HEADERS)),
    "",
  ];
}

function updateTracker(tracker, approvals) {
  const newline = tracker.includes("\r\n") ? "\r\n" : "\n";
  const lines = tracker.split(/\r?\n/);
  const headings = lines.flatMap((line, index) =>
    /^ {0,3}##[ \t]+Approvals[ \t]*$/.test(line) ? [index] : [],
  );

  if (headings.length === 0) {
    const section = emptyApprovalsSection(approvals);
    let insertion = lines.findIndex((line) => /^ {0,3}##[ \t]+Open questions[ \t]*$/.test(line));
    if (insertion < 0) {
      insertion = lines.findIndex((line) => /^ {0,3}##[ \t]+Approved decisions[ \t]*$/.test(line));
    }
    if (insertion < 0) lines.push(...section);
    else lines.splice(insertion, 0, ...section);
    return lines.join(newline);
  }

  if (headings.length !== 1) {
    throw new Error("The existing tracker must contain at most one ## Approvals heading");
  }

  const start = headings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  let headerIndex = -1;
  let headers = null;
  for (let index = start; index < end - 1; index += 1) {
    const header = splitTableRow(lines[index]);
    const separator = splitTableRow(lines[index + 1]);
    if (!header || !isSeparator(separator)) continue;
    const normalized = header.map((cell) => cleanCell(cell).toLowerCase());
    if (
      header.length === APPROVAL_HEADERS.length &&
      APPROVAL_HEADERS.every((label) => normalized.includes(label.toLowerCase()))
    ) {
      headerIndex = index;
      headers = header.map(cleanCell);
      break;
    }
  }
  if (headerIndex < 0) throw new Error("The existing ## Approvals section has no valid table");

  const existingIds = new Set();
  for (let index = headerIndex + 2; index < end; index += 1) {
    const row = splitTableRow(lines[index]);
    if (row) existingIds.add(cleanCell(row[0]));
  }

  const additions = approvals.filter((approval) => !existingIds.has(approval.approval_id));
  let insertion = headerIndex + 2;
  while (insertion < end && splitTableRow(lines[insertion])) insertion += 1;
  lines.splice(
    insertion,
    0,
    ...additions.map((approval) => renderApprovalRow(approval, headers)),
  );
  return lines.join(newline);
}

function countApprovals(tracker) {
  const lines = tracker.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^ {0,3}##[ \t]+Approvals[ \t]*$/.test(line));
  if (heading < 0) return 0;
  for (let index = heading + 1; index < lines.length - 1; index += 1) {
    const header = splitTableRow(lines[index]);
    if (!header || !isSeparator(splitTableRow(lines[index + 1]))) continue;
    let count = 0;
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = splitTableRow(lines[rowIndex]);
      if (!row) break;
      if (cleanCell(row[0])) count += 1;
    }
    return count;
  }
  return 0;
}

function utcStamp(date) {
  return date.toISOString().replace(/[-:.]/g, "");
}

async function validateOnDisk(manifest, manifestPath) {
  const manifestResult = validateManifest(manifest);
  const filesResult = await validateProjectFiles(manifest, manifestPath);
  const scopeResult = await validateScopeCurrency(manifest, manifestPath);
  const trackerResult = await validateTracker(manifest, manifestPath);
  const fileErrors = [...filesResult.errors, ...scopeResult.errors];
  return {
    valid: manifestResult.valid && fileErrors.length === 0 && trackerResult.valid,
    manifest: manifestResult,
    files: { ...filesResult, valid: fileErrors.length === 0, errors: fileErrors },
    scope: scopeResult,
    tracker: trackerResult,
  };
}

export async function migrateProjectToV3(projectRoot, { now } = {}) {
  return migrateProjectToV32(projectRoot, { now });
}


const CONVERGENCE_DIRECTORIES = [
  "cycles",
  "scopes",
  "inventories",
  "reconciliations",
  "passes",
  "executions",
  "no-edit-skips",
  "review-groups",
  "attestations",
  "evaluations",
];

function migrationTimestamp(now) {
  return utcDate(now);
}

function v32Manifest(legacy, timestamp) {
  const manifest = {
    ...legacy,
    schema_version: "3.2.0",
    paths: {
      ...legacy.paths,
      creation: legacy.paths.creation ?? ".author-toolkit/creation/",
      convergence: ".author-toolkit/convergence/",
    },
    updated_at: timestamp,
  };
  delete manifest.workflow;
  if (manifest.$schema) {
    manifest.$schema = manifest.$schema.replace(/[^/]*$/, "project-schema-v3.2.json");
  }
  return manifest;
}

async function createOperationalSkeleton(projectRoot, manifest) {
  for (const directory of ["state/chapters", "state/volumes", "batches", "staging"]) {
    await mkdir(path.resolve(projectRoot, manifest.paths.creation, directory), { recursive: true });
  }
  for (const directory of CONVERGENCE_DIRECTORIES) {
    await mkdir(path.resolve(projectRoot, manifest.paths.convergence, directory), { recursive: true });
  }
}

async function migrationSummary({
  manifestPath,
  snapshotPath,
  sourceVersion,
  manifest,
  approvalCount,
  scopeSnapshots = [],
  inventorySnapshots = [],
}) {
  return {
    manifest: manifestPath,
    snapshot: snapshotPath,
    source_schema_version: sourceVersion,
    target_schema_version: "3.2.0",
    scope_id: manifest.current_scope?.scope_id ?? null,
    scope_fingerprint: manifest.current_scope?.scope_fingerprint ?? null,
    approval_count: approvalCount,
    created_snapshots: {
      scopes: scopeSnapshots,
      inventories: inventorySnapshots,
    },
    recovery: await inspectLegacyRecovery(path.dirname(path.dirname(manifestPath)), manifest),
    valid: true,
  };
}

export async function migrateProjectToV32(projectRoot, { now } = {}) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const originalManifestText = await readFile(manifestPath, "utf8");
  const legacy = JSON.parse(originalManifestText);
  if (legacy.schema_version === "3.2.0") {
    const validation = await validateOnDisk(legacy, manifestPath);
    const scopeValidation = legacy.current_scope?.status === "confirmed"
      ? await validateFullManuscriptScope(legacy, manifestPath)
      : { valid: true, errors: [] };
    assertValid("v3.2 project validation", {
      valid: validation.valid && scopeValidation.valid,
      errors: [
        validation.manifest,
        validation.files,
        validation.tracker,
        scopeValidation,
      ].flatMap((result) => result.errors),
    });
    const tracker = await readFile(path.resolve(root, legacy.paths.audit_tracker), "utf8");
    return migrationSummary({
      manifestPath,
      snapshotPath: null,
      sourceVersion: "3.2.0",
      manifest: legacy,
      approvalCount: countApprovals(tracker),
    });
  }
  const migrationTime = migrationTimestamp(now);
  if (["3.0.0", "3.1.0"].includes(legacy.schema_version)) {
    return migrateLegacyV3Project(
      root,
      manifestPath,
      originalManifestText,
      legacy,
      migrationTime,
      legacy.schema_version,
    );
  }
  if (legacy.schema_version !== "2.0.0") {
    throw new Error(`Unsupported project schema_version: ${legacy.schema_version ?? "missing"}`);
  }
  assertValid("v2 manifest validation", validateManifest(legacy));
  const timestamp = migrationTime.toISOString();
  const proposedScope = await createCurrentScope(
    root,
    legacy.manuscript_root,
    legacy.paths,
    timestamp,
  );
  const currentScope = {
    ...proposedScope,
    scope_fingerprint: computeScopeFingerprint(proposedScope),
  };
  const pendingAction = convertPendingAction(legacy.workflow, currentScope.scope_id, timestamp);
  const trackerPath = path.resolve(root, legacy.paths.audit_tracker);
  const originalTracker = await readFile(trackerPath, "utf8");
  const existingApprovalIds = new Set(
    [...originalTracker.matchAll(/\|\s*`?(LEGACY-[0-9]{3,})`?\s*\|/g)].map(
      (match) => match[1],
    ),
  );
  const approvals = convertOverrides(
    legacy.workflow,
    currentScope,
    timestamp,
    existingApprovalIds,
  );
  const manifest = {
    ...v32Manifest(legacy, timestamp),
    current_scope: currentScope,
  };
  if (pendingAction) manifest.pending_action = pendingAction;
  else delete manifest.pending_action;
  const updatedTracker = updateTracker(originalTracker, approvals);

  assertValid("v3.2 manifest preflight validation", validateManifest(manifest));
  assertValid("v3.2 tracker preflight validation", await validateTrackerV3Markdown(updatedTracker, root));

  const migrationDirectory = path.join(
    root,
    ".author-toolkit",
    "migrations",
    `${utcStamp(migrationTime)}-v2-v3_2`,
  );
  const snapshotPath = path.join(migrationDirectory, "project.json");
  await mkdir(path.dirname(migrationDirectory), { recursive: true });
  await mkdir(migrationDirectory);
  await createNoClobberVerified(snapshotPath, originalManifestText);
  await createOperationalSkeleton(root, manifest);
  assertValid("v3.2 project files preflight validation", await validateProjectFiles(manifest, manifestPath));

  await writeAtomicVerified(trackerPath, updatedTracker);
  try {
    await writeAtomicVerified(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    await writeAtomicVerified(trackerPath, originalTracker);
    throw error;
  }

  const inventory = await recordInventorySnapshot(root, manifest, { now: migrationTime });
  const migrationRecord = {
    migrated_at: timestamp,
    source_schema_version: "2.0.0",
    target_schema_version: "3.2.0",
    legacy_current_scope: legacy.current_scope ?? null,
    current_scope: currentScope,
    pending_action: pendingAction,
    overrides: approvals,
    scope_disposition: "proposed-reconfirmation-required",
    created_snapshots: { scopes: [], inventories: [inventory.reference] },
  };
  await writeAtomicVerified(
    path.join(migrationDirectory, "migration.json"),
    `${JSON.stringify(migrationRecord, null, 2)}\n`,
  );

  const validation = await validateOnDisk(manifest, manifestPath);
  assertValid("migrated project validation", {
    valid: validation.valid,
    errors: [validation.manifest, validation.files, validation.tracker].flatMap((result) => result.errors),
  });
  return migrationSummary({
    manifestPath,
    snapshotPath,
    sourceVersion: "2.0.0",
    manifest,
    approvalCount: countApprovals(updatedTracker),
    inventorySnapshots: [inventory.reference],
  });
}


async function findLegacyScopeConfirmation(root, legacy) {
  if (legacy.current_scope?.status !== "confirmed") return null;
  const tracker = await readFile(path.resolve(root, legacy.paths.audit_tracker), "utf8");
  const parsed = await parseTrackerState(tracker, root);
  if (!parsed.valid) return null;
  const scopeFingerprint = computeScopeFingerprint(legacy.current_scope);
  const candidates = parsed.approvals.filter((approval) =>
    approval.type === "scope-confirmation" &&
    approval.operation === "intake" &&
    approval.scopeId === legacy.current_scope.scope_id &&
    approval.status === "approved" &&
    JSON.stringify(approval.paths) === JSON.stringify(
      legacy.current_scope.files.map((file) => file.path),
    ) &&
    approval.reason.split(/\s+/).includes(`scope_fingerprint=${scopeFingerprint}`) &&
    approval.reason.split(/\s+/).includes("reading_order_confirmed=true")
  );
  if (candidates.length !== 1) return null;
  return {
    decision_id: candidates[0].id,
    confirmed_at: candidates[0].updated,
    reading_order_confirmed: true,
  };
}

async function migrateLegacyV3Project(
  root,
  manifestPath,
  originalManifestText,
  legacy,
  migrationTime,
  sourceVersion,
) {
  const validation = await validateOnDisk(legacy, manifestPath);
  assertValid(`${sourceVersion === "3.0.0" ? "v3" : "v3.1"} project validation`, {
    valid: validation.valid,
    errors: [validation.manifest, validation.files, validation.tracker].flatMap((result) => result.errors),
  });
  const timestamp = migrationTime.toISOString();
  const scopeConfirmation = await findLegacyScopeConfirmation(root, legacy);
  const manifest = v32Manifest(legacy, timestamp);
  if (legacy.current_scope) {
    manifest.current_scope = {
      ...legacy.current_scope,
      status: "proposed",
      scope_fingerprint: computeScopeFingerprint(legacy.current_scope),
    };
    delete manifest.current_scope.snapshot_path;
    delete manifest.current_scope.snapshot_sha256;
  }
  assertValid("v3.2 manifest preflight validation", validateManifest(manifest));

  const sourceTag = `v${sourceVersion.split(".").slice(0, 2).join("_")}`;
  const migrationDirectory = path.join(
    root,
    ".author-toolkit",
    "migrations",
    `${utcStamp(migrationTime)}-${sourceTag}-v3_2`,
  );
  const snapshotPath = path.join(migrationDirectory, "project.json");
  await mkdir(path.dirname(migrationDirectory), { recursive: true });
  await mkdir(migrationDirectory);
  await createNoClobberVerified(snapshotPath, originalManifestText);
  await createOperationalSkeleton(root, manifest);
  assertValid("v3.2 project files preflight validation", await validateProjectFiles(manifest, manifestPath));
  await writeAtomicVerified(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  let migratedManifest = manifest;
  let inventory;
  const scopeSnapshots = [];
  if (scopeConfirmation) {
    const recorded = await recordScope(root, legacy.current_scope, {
      authorConfirmation: scopeConfirmation,
      now: migrationTime,
    });
    migratedManifest = { ...manifest, current_scope: recorded.current_scope };
    scopeSnapshots.push({
      path: recorded.current_scope.snapshot_path,
      sha256: recorded.current_scope.snapshot_sha256,
      scope_id: recorded.scope_id,
      scope_fingerprint: recorded.scope_fingerprint,
      inventory_fingerprint: recorded.inventory_fingerprint,
    });
    const snapshot = JSON.parse(
      await readFile(path.resolve(root, recorded.current_scope.snapshot_path), "utf8"),
    );
    inventory = { reference: snapshot.inventory };
  } else {
    inventory = await recordInventorySnapshot(root, migratedManifest, { now: migrationTime });
  }
  const tracker = await readFile(path.resolve(root, legacy.paths.audit_tracker), "utf8");
  const migrationRecord = {
    migrated_at: timestamp,
    source_schema_version: sourceVersion,
    target_schema_version: "3.2.0",
    legacy_current_scope: legacy.current_scope ?? null,
    current_scope: migratedManifest.current_scope ?? null,
    pending_action: legacy.pending_action ?? null,
    overrides: [],
    scope_disposition: scopeConfirmation
      ? "confirmed-with-legacy-evidence"
      : legacy.current_scope?.status === "confirmed"
        ? "reconfirmation-required"
        : legacy.current_scope?.status ?? "none",
    scope_confirmation: scopeConfirmation,
    created_snapshots: { scopes: scopeSnapshots, inventories: [inventory.reference] },
  };
  await writeAtomicVerified(
    path.join(migrationDirectory, "migration.json"),
    `${JSON.stringify(migrationRecord, null, 2)}\n`,
  );
  const upgradedValidation = await validateOnDisk(migratedManifest, manifestPath);
  assertValid("migrated project validation", {
    valid: upgradedValidation.valid,
    errors: [
      upgradedValidation.manifest,
      upgradedValidation.files,
      upgradedValidation.tracker,
    ].flatMap((result) => result.errors),
  });
  return migrationSummary({
    manifestPath,
    snapshotPath,
    sourceVersion,
    manifest: migratedManifest,
    approvalCount: countApprovals(tracker),
    scopeSnapshots,
    inventorySnapshots: [inventory.reference],
  });
}
