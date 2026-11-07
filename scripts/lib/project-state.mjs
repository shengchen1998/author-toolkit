import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateBackupIndex, validateBackupIndexFile } from "./backup.mjs";
import { getCycleStatus } from "./cycles.mjs";
import { validateManifest } from "./manifest.mjs";
import { validateProjectFiles, validateScopeCurrency } from "./project-files.mjs";
import { validateFullManuscriptScope } from "./scope.mjs";
import { packagedReferences, validateDeployedReferences } from "./shared-references.mjs";
import { createNoClobberVerified } from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";
import { parseTrackerState, validateTracker } from "./tracker.mjs";

const packagedReferenceUrl = globalThis[Symbol.for("author-toolkit.packaged-references")];
const packagedAssets = fileURLToPath(
  packagedReferenceUrl
    ? new URL("../", packagedReferenceUrl)
    : new URL("../../skills/setup-author-toolkit/assets/", import.meta.url),
);

async function readTemplate(name) {
  return readFile(path.join(packagedAssets, name), "utf8");
}

async function deployReferences(projectRoot) {
  const errors = [];
  const entries = await readdir(packagedReferences, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relativePath = `.author-toolkit/references/${entry.name}`;
    const target = path.join(projectRoot, relativePath);
    const packaged = await readFile(path.join(packagedReferences, entry.name));
    try {
      const deployed = await readFile(target);
      if (!deployed.equals(packaged)) {
        errors.push({
          code: "reference-version-conflict",
          instancePath: `/${relativePath}`,
          message: `reference-version-conflict: ${relativePath}; initialization leaves the existing file unchanged`,
        });
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (errors.length > 0) return { valid: false, created: [], errors };

  const created = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relativePath = `.author-toolkit/references/${entry.name}`;
    const target = path.join(projectRoot, relativePath);
    const contents = await readFile(path.join(packagedReferences, entry.name));
    try {
      await createNoClobberVerified(target, contents);
      created.push(relativePath);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  return { valid: true, created, errors: [] };
}

async function createFile(projectRoot, relativePath, contents, created) {
  await createNoClobberVerified(path.resolve(projectRoot, relativePath), contents);
  created.push(relativePath);
}

function initializationConflict(relativePath, message, details = {}) {
  return {
    code: "initialization-conflict",
    instancePath: `/${relativePath}`,
    message,
    ...details,
  };
}

async function preflightSkeletons(root, manifest, manifestPath) {
  const existing = {
    storyBible: null,
    tracker: null,
    backupIndex: null,
  };
  for (const [key, relativePath] of [
    ["storyBible", manifest.paths.story_bible],
    ["tracker", manifest.paths.audit_tracker],
    ["backupIndex", path.posix.join(manifest.paths.backups, "index.json")],
  ]) {
    try {
      existing[key] = await readFile(path.resolve(root, relativePath), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        return { errors: [initializationConflict(relativePath, error.message)] };
      }
    }
  }
  const errors = [];
  if (existing.storyBible !== null && existing.storyBible.trim().length === 0) {
    errors.push(initializationConflict(manifest.paths.story_bible, "Existing Story Bible must not be empty"));
  }
  if (existing.tracker !== null) {
    const validation = await validateTracker(manifest, manifestPath);
    errors.push(...validation.errors.map((error) => initializationConflict(
      manifest.paths.audit_tracker,
      error.message,
      { validation_error: error },
    )));
  }
  if (existing.backupIndex !== null) {
    let candidate;
    try {
      candidate = JSON.parse(existing.backupIndex);
    } catch (error) {
      return { existing, errors: [initializationConflict(
        path.posix.join(manifest.paths.backups, "index.json"),
        error.message,
      )] };
    }
    const validation = await validateBackupIndex(root, candidate, { manifest });
    errors.push(...validation.errors.map((error) => initializationConflict(
      path.posix.join(manifest.paths.backups, "index.json"),
      error.message,
      { validation_error: error },
    )));
  }
  return { existing, errors };
}

async function preflightImportedState(root, manifest, manifestPath) {
  const errors = [];
  const allowed = new Set([
    "AGENTS.md",
    path.relative(root, manifestPath).split(path.sep).join("/"),
    manifest.paths.story_bible,
    manifest.paths.audit_tracker,
    path.posix.join(manifest.paths.backups, "index.json"),
  ]);
  const operationalRoots = [
    ".author-toolkit",
    manifest.paths.reports,
    manifest.paths.sessions,
    manifest.paths.backups,
    manifest.paths.handoffs,
    manifest.paths.creation,
    manifest.paths.convergence,
  ].map((value) => value.replace(/\/$/, ""));
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { errors };
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relativePath = path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    if (relativePath === manifest.manuscript_root.replace(/\/$/, "") || relativePath.startsWith(`${manifest.manuscript_root.replace(/\/$/, "")}/`)) continue;
    if (relativePath.startsWith(".author-toolkit/references/") || allowed.has(relativePath)) continue;
    if (operationalRoots.some((operational) => relativePath === operational || relativePath.startsWith(`${operational}/`))) {
      errors.push(initializationConflict(
        relativePath,
        "Imported operational state is not allowed during manuscript-only initialization",
      ));
    }
  }
  return { errors };
}

async function publishMissingSkeletons(root, manifest, manifestPath, existing, contents, created) {
  try {
    await createFile(root, "AGENTS.md", contents.agents, created);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  if (existing.manifest === null) await createFile(root, manifestPath, contents.manifest, created);
  if (existing.storyBible === null) await createFile(root, manifest.paths.story_bible, contents.storyBible, created);
  if (existing.tracker === null) await createFile(root, manifest.paths.audit_tracker, contents.tracker, created);
  if (existing.backupIndex === null) {
    await createFile(root, path.posix.join(manifest.paths.backups, "index.json"), contents.backupIndex, created);
  }
}

export async function initializeProject(projectRoot, input = {}, options = {}) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    const validation = validateManifest(existing);
    if (!validation.valid) {
      return {
        valid: false,
        initialized: false,
        manifest_path: manifestPath,
        created: [],
        errors: validation.errors,
      };
    }
    const preflight = await preflightSkeletons(root, existing, manifestPath);
    if (preflight.errors.length > 0) {
      return {
        valid: false,
        initialized: false,
        manifest_path: manifestPath,
        created: [],
        errors: preflight.errors,
      };
    }
    const references = await deployReferences(root);
    if (!references.valid) {
      return {
        valid: false,
        initialized: false,
        manifest_path: manifestPath,
        created: [],
        errors: references.errors,
      };
    }
    const timestamp = utcTimestamp(options);
    await publishMissingSkeletons(root, existing, manifestPath, {
      ...preflight.existing,
      manifest: existing,
    }, {
      agents: await readTemplate("AGENTS.md"),
      manifest: null,
      storyBible: (await readTemplate("story-bible-template.md"))
        .replace("PROJECT_TITLE", input.project_title ?? "Untitled Book"),
      tracker: (await readTemplate("audit-tracker-template.md"))
        .replace("- Project root:", `- Project root: ${root}`)
        .replace("- Manifest created at:", `- Manifest created at: ${timestamp}`),
      backupIndex: await readTemplate("backup-index-template.json"),
    }, references.created);
    const errors = [
      ...(await validateProjectFiles(existing, manifestPath)).errors,
      ...(await validateTracker(existing, manifestPath)).errors,
      ...(await validateBackupIndexFile(
        path.resolve(root, existing.paths.backups, "index.json"),
        { projectRoot: root },
      )).errors,
    ];
    if (existing.current_scope) {
      errors.push(...(existing.current_scope.status === "confirmed"
        ? await validateFullManuscriptScope(existing, manifestPath)
        : await validateScopeCurrency(existing, manifestPath)).errors);
    }
    return {
      valid: errors.length === 0,
      initialized: false,
      manifest_path: manifestPath,
      created: references.created,
      errors,
    };
  } catch (error) {
    if (error.code !== "ENOENT") {
      return {
        valid: false,
        initialized: false,
        manifest_path: manifestPath,
        errors: [{ code: "manifest-invalid", message: error.message }],
      };
    }
  }

  const template = JSON.parse(await readTemplate("project-template.json"));
  const timestamp = utcTimestamp(options);
  const manifest = {
    ...template,
    language: input.language ?? template.language,
    manuscript_root: input.manuscript_root ?? template.manuscript_root,
    paths: { ...template.paths, ...(input.paths ?? {}) },
    created_at: timestamp,
    updated_at: timestamp,
  };
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    return {
      valid: false,
      initialized: false,
      manifest_path: manifestPath,
      errors: manifestValidation.errors,
    };
  }

  const preflight = await preflightSkeletons(root, manifest, manifestPath);
  const imported = await preflightImportedState(root, manifest, manifestPath);
  const preflightErrors = [...preflight.errors, ...imported.errors];
  if (preflightErrors.length > 0) {
    return {
      valid: false,
      initialized: false,
      manifest_path: manifestPath,
      created: [],
      errors: preflightErrors,
    };
  }

  const references = await deployReferences(root);
  if (!references.valid) {
    return {
      valid: false,
      initialized: false,
      manifest_path: manifestPath,
      created: [],
      errors: references.errors,
    };
  }

  for (const directory of [
    manifest.manuscript_root,
    manifest.paths.reports,
    manifest.paths.sessions,
    manifest.paths.backups,
    manifest.paths.handoffs,
    manifest.paths.creation,
    manifest.paths.convergence,
  ]) {
    await mkdir(path.resolve(root, directory), { recursive: true });
  }

  const created = [...references.created];
  const tracker = (await readTemplate("audit-tracker-template.md"))
    .replace("- Project root:", `- Project root: ${root}`)
    .replace("- Manifest created at:", `- Manifest created at: ${timestamp}`);
  const storyBible = (await readTemplate("story-bible-template.md"))
    .replace("PROJECT_TITLE", input.project_title ?? "Untitled Book");
  await publishMissingSkeletons(root, manifest, manifestPath, {
    ...preflight.existing,
    manifest: null,
  }, {
    agents: await readTemplate("AGENTS.md"),
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    storyBible,
    tracker,
    backupIndex: await readTemplate("backup-index-template.json"),
  }, created);

  const checks = [
    validateManifest(manifest),
    await validateProjectFiles(manifest, manifestPath),
    await validateTracker(manifest, manifestPath),
    await validateBackupIndexFile(
      path.resolve(root, manifest.paths.backups, "index.json"),
      { projectRoot: root },
    ),
    await validateDeployedReferences(root),
  ];
  const errors = checks.flatMap((check) => check.errors);
  return {
    valid: errors.length === 0,
    initialized: errors.length === 0,
    manifest_path: manifestPath,
    created,
    errors,
  };
}

const findingStatuses = ["open", "resolved", "deferred", "dismissed", "stale"];
const decisionStatuses = ["approved", "deferred", "cancelled", "superseded"];

function statusCounts(rows, statuses) {
  const counts = { total: rows.length };
  for (const status of statuses) {
    counts[status] = rows.filter((row) => row.status === status).length;
  }
  return counts;
}

function emptyDecisions() {
  return {
    findings: statusCounts([], findingStatuses),
    approvals: statusCounts([], decisionStatuses),
    cycle_completions: statusCounts([], decisionStatuses),
  };
}

function compactBlocker(blocker) {
  return {
    code: blocker.code ?? blocker.keyword ?? "validation-failed",
    message: blocker.message,
    required_action: blocker.required_action ?? null,
  };
}

function setupAction() {
  return {
    strategy: "setup-author-toolkit",
    operation: "initialize",
    command: "setup-author-toolkit",
  };
}

function unavailableStatus(root, references, projectErrors, message, action = setupAction()) {
  const errors = [...projectErrors, ...references.errors];
  return {
    valid: false,
    result: {
      view: "compact",
      project: {
        root,
        manifest_path: path.join(root, ".author-toolkit", "project.json"),
        schema_version: null,
        project_type: null,
        language: null,
        manuscript_root: null,
        created_at: null,
        updated_at: null,
        valid: false,
        errors: projectErrors,
      },
      references,
      scope: null,
      pending_action: null,
      cycle: null,
      evaluation: {
        outcome: "indeterminate",
        current: false,
        blockers: [{ code: "project-state-unavailable", message, required_action: action }],
        request_completion: null,
      },
      decisions: emptyDecisions(),
      next_action: action,
    },
    errors,
  };
}

function compactCycle(cycle, interruptedOperation) {
  if (cycle?.status === "active") {
    return {
      cycle_id: cycle.cycle_id,
      revision: cycle.revision,
      status: cycle.status,
      current_strategy: cycle.current_strategy,
      recovery_position: cycle.recovery_position,
      interrupted_operation: interruptedOperation ?? null,
    };
  }
  if (interruptedOperation) {
    return {
      cycle_id: interruptedOperation.cycle_id,
      revision: null,
      status: null,
      current_strategy: null,
      recovery_position: null,
      interrupted_operation: interruptedOperation,
    };
  }
  return null;
}

export async function getCompactProjectStatus(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    const references = await validateDeployedReferences(root);
    return unavailableStatus(
      root,
      references,
      [{ code: "manifest-invalid", instancePath: "/.author-toolkit/project.json", message: error.message }],
      "The project manifest cannot be read; repair or reinitialize the project state.",
    );
  }

  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    const references = await validateDeployedReferences(root);
    const error = manifestValidation.errors[0];
    return unavailableStatus(
      root,
      references,
      manifestValidation.errors,
      error.message,
      error.required_action ?? setupAction(),
    );
  }

  const references = await validateDeployedReferences(root);
  if (!references.valid) {
    return unavailableStatus(
      root,
      references,
      [],
      "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
    );
  }

  const projectChecks = [{ name: "manifest", ...manifestValidation }];
  if (projectChecks[0].valid) {
    projectChecks.push(
      { name: "files", ...await validateProjectFiles(manifest, manifestPath) },
      { name: "tracker", ...await validateTracker(manifest, manifestPath) },
      ...(manifest.schema_version === "4.0.0" ? [{
        name: "backups",
        ...await validateBackupIndexFile(
          path.resolve(root, manifest.paths.backups, "index.json"),
          { projectRoot: root },
        ),
      }] : []),
    );
    if (manifest.current_scope) {
      projectChecks.push({
        name: "scope",
        ...manifest.schema_version === "4.0.0" && manifest.current_scope.status === "confirmed"
          ? await validateFullManuscriptScope(manifest, manifestPath)
          : await validateScopeCurrency(manifest, manifestPath),
      });
    }
  }
  const projectErrors = projectChecks.flatMap((check) =>
    check.errors.map((error) => ({ ...error, check: check.name }))
  );
  const projectValid = projectErrors.length === 0;

  let convergence;
  if (projectChecks[0].valid && manifest.schema_version === "4.0.0") {
    convergence = await getCycleStatus(root);
  } else {
    convergence = {
      query_valid: false,
      outcome: "indeterminate",
      current: false,
      blockers: [{
        code: "project-validation-failed",
        message: "A valid 4.0.0 manifest is required before convergence status is available.",
        required_action: setupAction(),
      }],
      required_action: setupAction(),
      request_completion: null,
    };
  }

  let tracker = { findings: [], approvals: [], completion_decisions: [] };
  try {
    tracker = await parseTrackerState(
      await readFile(path.resolve(root, manifest.paths.audit_tracker), "utf8"),
      root,
    );
  } catch {
  }
  const scopeCheck = projectChecks.find((check) => check.name === "scope");
  const valid = projectValid && convergence.query_valid;
  const errors = [
    ...projectErrors,
    ...(convergence.query_valid ? [] : convergence.blockers),
  ];
  return {
    valid,
    result: {
      view: "compact",
      project: {
        root,
        manifest_path: manifestPath,
        schema_version: manifest.schema_version,
        project_type: manifest.project_type,
        language: manifest.language,
        manuscript_root: manifest.manuscript_root,
        created_at: manifest.created_at,
        updated_at: manifest.updated_at,
        valid: projectValid,
        errors: projectErrors,
      },
      references,
      scope: manifest.current_scope ? {
        scope_id: manifest.current_scope.scope_id,
        scope_fingerprint: manifest.current_scope.scope_fingerprint ?? null,
        status: manifest.current_scope.status,
        file_count: manifest.current_scope.files.length,
        full_manuscript: scopeCheck?.full_manuscript ?? false,
      } : null,
      pending_action: manifest.pending_action ?? null,
      cycle: compactCycle(convergence.cycle, manifest.cycle_operation),
      evaluation: {
        outcome: convergence.outcome,
        current: convergence.current,
        blockers: convergence.blockers.map(compactBlocker),
        request_completion: convergence.request_completion ? {
          status: convergence.request_completion.status,
          blockers: convergence.request_completion.blockers.map(compactBlocker),
        } : null,
      },
      decisions: {
        findings: statusCounts(tracker.findings, findingStatuses),
        approvals: statusCounts(tracker.approvals, decisionStatuses),
        cycle_completions: statusCounts(tracker.completion_decisions, decisionStatuses),
      },
      next_action: convergence.required_action,
    },
    errors,
  };
}

export async function getFullProjectStatus(projectRoot) {
  const compact = await getCompactProjectStatus(projectRoot);
  let manifest = null;
  let status = null;
  if (compact.result.references.valid) {
    try {
      manifest = JSON.parse(await readFile(compact.result.project.manifest_path, "utf8"));
    } catch {
      manifest = null;
    }
  }
  if (manifest?.schema_version === "4.0.0" && compact.result.project.valid) {
    status = await getCycleStatus(projectRoot);
  }
  return {
    valid: compact.valid,
    result: {
      view: "full",
      manifest,
      project: compact.result.project,
      references: compact.result.references,
      status,
      decisions: compact.result.decisions,
      next_action: compact.result.next_action,
    },
    errors: compact.errors,
  };
}
