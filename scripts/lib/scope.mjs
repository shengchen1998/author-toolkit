import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import {
  collectManuscriptInventory,
  isOperationalManuscriptPath,
} from "./manuscript.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import {
  validateInventorySnapshotSchema,
  validateScopeSnapshotSchema,
} from "./schemas.mjs";
import { createNoClobberVerified, writeAtomicVerified } from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function sorted(values) {
  return [...values].sort();
}

function byPath(left, right) {
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

function canonicalInventory(value) {
  return {
    manuscript_root: value.manuscript_root,
    files: [...value.files]
      .sort(byPath)
      .map(({ path: filePath, sha256: hash }) => ({ path: filePath, sha256: hash })),
    excluded_files: sorted(value.excluded_files),
  };
}

export function computeScopeFingerprint(scope) {
  return sha256(
    JSON.stringify({
      files: scope.files.map(({ path: filePath, sha256: hash }) => ({ path: filePath, sha256: hash })),
      excluded_files: sorted(scope.excluded_files),
    }),
  );
}

export function computeInventoryFingerprint(inventory) {
  return sha256(JSON.stringify(canonicalInventory(inventory)));
}

async function atomicWrite(file, contents) {
  await writeAtomicVerified(file, contents);
}

async function writeImmutable(file, contents) {
  try {
    await createNoClobberVerified(file, contents);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(file, "utf8");
    if (existing !== contents) {
      throw new Error(`Immutable snapshot already exists with different content: ${file}`);
    }
  }
}

async function readExistingInventory(file, expected) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const inventory = JSON.parse(contents);
  if (
    computeInventoryFingerprint(inventory) !== expected.inventory_fingerprint ||
    inventory.manuscript_root !== expected.manuscript_root ||
    JSON.stringify(inventory.files) !== JSON.stringify(expected.files) ||
    JSON.stringify(sorted(inventory.excluded_files)) !==
      JSON.stringify(sorted(expected.excluded_files))
  ) {
    throw new Error(`Immutable inventory snapshot has inconsistent content: ${file}`);
  }
  return contents;
}

async function currentInventory(projectRoot, manifest) {
  const inventory = await collectManuscriptInventory(
    projectRoot,
    manifest.manuscript_root,
    manifest.paths,
  );
  const files = [];
  for (const entry of inventory.files) {
    files.push({ path: entry.path, sha256: sha256(await readFile(entry.absolute)) });
  }
  return {
    files,
    excludedFiles: inventory.excludedFiles,
    absoluteByPath: new Map(inventory.files.map((entry) => [entry.path, entry.absolute])),
  };
}

export async function collectVersionedInventory(projectRoot, manifest) {
  const current = await currentInventory(projectRoot, manifest);
  const inventory = {
    manuscript_root: manifest.manuscript_root,
    files: current.files,
    excluded_files: sorted(current.excludedFiles),
  };
  return {
    ...inventory,
    inventory_fingerprint: computeInventoryFingerprint(inventory),
  };
}

export async function recordInventorySnapshot(projectRoot, manifest, options = {}) {
  const observed = await collectVersionedInventory(projectRoot, manifest);
  const record = {
    schema_version: "1.0.0",
    ...observed,
    created_at: utcTimestamp(options),
  };
  const validation = validateInventorySnapshot(record);
  if (!validation.valid) throw validationError(validation);
  const relative = path.posix.join(
    manifest.paths.convergence,
    "inventories",
    `${record.inventory_fingerprint}.json`,
  );
  const absolute = path.resolve(projectRoot, relative);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  await writeImmutable(absolute, text);
  return {
    record,
    reference: {
      path: relative,
      sha256: sha256(text),
      inventory_fingerprint: record.inventory_fingerprint,
    },
  };
}

export function diffManuscriptInventories(previous, current) {
  const beforeByPath = new Map((previous.files ?? []).map((file) => [file.path, file]));
  const afterByPath = new Map((current.files ?? []).map((file) => [file.path, file]));
  const created = current.files.filter((file) => !beforeByPath.has(file.path));
  const modified = current.files.filter((file) =>
    beforeByPath.has(file.path) && beforeByPath.get(file.path).sha256 !== file.sha256
  ).map((file) => ({
    path: file.path,
    input_sha256: beforeByPath.get(file.path).sha256,
    output_sha256: file.sha256,
  }));
  const deleted = previous.files.filter((file) => !afterByPath.has(file.path)).map((file) => ({
    path: file.path,
    input_sha256: file.sha256,
  }));
  const beforeRetained = previous.files.filter((file) => afterByPath.has(file.path)).map((file) => file.path);
  const afterRetained = current.files.filter((file) => beforeByPath.has(file.path)).map((file) => file.path);
  const reordered = [];
  if (JSON.stringify(beforeRetained) !== JSON.stringify(afterRetained)) {
    const afterIndex = new Map(afterRetained.map((filePath, index) => [filePath, index]));
    for (const [beforeIndex, filePath] of beforeRetained.entries()) {
      const beforePrevious = beforeRetained[beforeIndex - 1] ?? null;
      const indexAfter = afterIndex.get(filePath);
      const afterPrevious = afterRetained[indexAfter - 1] ?? null;
      if (beforePrevious !== afterPrevious) {
        reordered.push({
          path: filePath,
          before_index: previous.files.findIndex((file) => file.path === filePath),
          after_index: current.files.findIndex((file) => file.path === filePath),
        });
      }
    }
  }
  return {
    created,
    modified,
    deleted,
    reordered,
    evidence_affected: [...new Set([
      ...created.map((file) => file.path),
      ...modified.map((file) => file.path),
      ...deleted.map((file) => file.path),
      ...reordered.map((file) => file.path),
    ])],
    dependency_affected: [],
  };
}

function validationError(result) {
  return new Error(
    `v3.2 scope validation failed:\n${result.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("\n")}`,
  );
}

export async function recordScope(projectRoot, scope, options = {}) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema_version !== "3.2.0") {
    throw new Error("recordScope immutable snapshots require a v3.2 project");
  }
  const originalValidation = validateManifest(manifest);
  if (!originalValidation.valid) throw validationError(originalValidation);

  const updatedAt = utcTimestamp(options);
  const scopeFingerprint = computeScopeFingerprint(scope);
  const currentScope = {
    scope_id: scope.scope_id,
    description: scope.description,
    status: scope.status,
    files: scope.files.map(({ path: filePath, sha256: hash }) => ({ path: filePath, sha256: hash })),
    excluded_files: [...scope.excluded_files],
    created_at: scope.created_at,
    scope_fingerprint: scopeFingerprint,
  };

  if (scope.status === "proposed") {
    const updated = { ...manifest, current_scope: currentScope, updated_at: updatedAt };
    const validation = validateManifest(updated);
    if (!validation.valid) throw validationError(validation);
    await atomicWrite(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
    return {
      scope_id: scope.scope_id,
      scope_fingerprint: scopeFingerprint,
      inventory_fingerprint: null,
      snapshot_path: null,
      inventory_path: null,
      current_scope: currentScope,
    };
  }

  if (scope.status !== "confirmed") throw new Error(`Unsupported scope status: ${scope.status}`);
  const confirmation = options.authorConfirmation;
  if (!confirmation || confirmation.reading_order_confirmed !== true) {
    throw new Error("A confirmed scope requires author confirmation of its reading order");
  }

  const inventory = await currentInventory(root, manifest);
  const scopePaths = new Set();
  for (const file of scope.files) {
    if (scopePaths.has(file.path)) throw new Error(`Duplicate scope path: ${file.path}`);
    scopePaths.add(file.path);
    const absolute = inventory.absoluteByPath.get(file.path);
    if (!absolute) throw new Error(`Scope path is not in manuscript inventory: ${file.path}`);
    if (sha256(await readFile(absolute)) !== file.sha256) {
      throw new Error(`Scope input hash is not current: ${file.path}`);
    }
  }
  if (JSON.stringify(sorted(scope.excluded_files)) !== JSON.stringify(sorted(inventory.excludedFiles))) {
    throw new Error("Scope exclusions do not match the current manuscript inventory");
  }

  const inventoryRecord = {
    schema_version: "1.0.0",
    inventory_fingerprint: "",
    manuscript_root: manifest.manuscript_root,
    files: inventory.files,
    excluded_files: sorted(inventory.excludedFiles),
    created_at: updatedAt,
  };
  inventoryRecord.inventory_fingerprint = computeInventoryFingerprint(inventoryRecord);
  const inventoryRelative = path.posix.join(
    manifest.paths.convergence,
    "inventories",
    `${inventoryRecord.inventory_fingerprint}.json`,
  );
  const inventoryPath = path.resolve(root, inventoryRelative);
  let inventoryText = await readExistingInventory(inventoryPath, inventoryRecord);
  if (inventoryText === null) inventoryText = `${JSON.stringify(inventoryRecord, null, 2)}\n`;

  const snapshotRelative = path.posix.join(
    manifest.paths.convergence,
    "scopes",
    `${scope.scope_id}-${scopeFingerprint}.json`,
  );
  const snapshotPath = path.resolve(root, snapshotRelative);
  const snapshot = {
    schema_version: "1.0.0",
    scope_id: scope.scope_id,
    scope_fingerprint: scopeFingerprint,
    description: scope.description,
    status: "confirmed",
    files: currentScope.files,
    excluded_files: sorted(scope.excluded_files),
    created_at: scope.created_at,
    inventory: {
      path: inventoryRelative,
      sha256: sha256(inventoryText),
      inventory_fingerprint: inventoryRecord.inventory_fingerprint,
    },
    author_confirmation: {
      decision_id: confirmation.decision_id,
      confirmed_at: confirmation.confirmed_at,
      reading_order_confirmed: true,
    },
  };
  const inventoryValidation = validateInventorySnapshot(inventoryRecord);
  if (!inventoryValidation.valid) throw validationError(inventoryValidation);
  const snapshotValidation = validateScopeSnapshot(snapshot);
  if (!snapshotValidation.valid) throw validationError(snapshotValidation);
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  currentScope.snapshot_path = snapshotRelative;
  currentScope.snapshot_sha256 = sha256(snapshotText);
  const updated = { ...manifest, current_scope: currentScope, updated_at: updatedAt };
  const validation = validateManifest(updated);
  if (!validation.valid) throw validationError(validation);

  await writeImmutable(inventoryPath, inventoryText);
  await writeImmutable(snapshotPath, snapshotText);
  await atomicWrite(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  return {
    scope_id: scope.scope_id,
    scope_fingerprint: scopeFingerprint,
    inventory_fingerprint: inventoryRecord.inventory_fingerprint,
    snapshot_path: snapshotPath,
    inventory_path: inventoryPath,
    current_scope: currentScope,
  };
}

function scopeFailure(instancePath, message, keyword = "full-manuscript-scope") {
  return { instancePath, keyword, message, params: {} };
}

function sameFiles(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameStrings(left, right) {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function relevantExclusions(values, paths) {
  return values.filter((value) => !isOperationalManuscriptPath(value, paths));
}

export async function validateFullManuscriptScope(manifest, manifestPath) {
  const projectRoot = projectRootFromManifest(manifestPath);
  const scope = manifest.current_scope;
  const result = {
    valid: false,
    full_manuscript: false,
    errors: [],
    projectRoot,
    scope_id: scope?.scope_id ?? null,
    scope_fingerprint: scope?.scope_fingerprint ?? null,
    inventory_fingerprint: null,
    snapshot_path: scope?.snapshot_path ?? null,
  };
  if (!scope) {
    result.errors.push(scopeFailure("/current_scope", "a current scope is required"));
    return result;
  }
  if (scope.status !== "confirmed") {
    result.errors.push(
      scopeFailure(
        "/current_scope/status",
        "full-manuscript validation requires a confirmed scope",
        "scope-status",
      ),
    );
    return result;
  }

  const expectedFingerprint = computeScopeFingerprint(scope);
  if (scope.scope_fingerprint !== expectedFingerprint) {
    result.errors.push(
      scopeFailure(
        "/current_scope/scope_fingerprint",
        `scope_fingerprint must be ${expectedFingerprint}`,
        "scope-fingerprint",
      ),
    );
  }

  const seen = new Set();
  for (const [index, file] of scope.files.entries()) {
    if (seen.has(file.path)) {
      result.errors.push(
        scopeFailure(
          `/current_scope/files/${index}/path`,
          `duplicate manuscript path in scope: ${file.path}`,
          "scope-uniqueness",
        ),
      );
    }
    seen.add(file.path);
  }

  let snapshotText;
  let snapshot;
  try {
    snapshotText = await readFile(path.resolve(projectRoot, scope.snapshot_path), "utf8");
    snapshot = JSON.parse(snapshotText);
    result.errors.push(...validateScopeSnapshot(snapshot).errors);
    result.inventory_fingerprint = snapshot.inventory?.inventory_fingerprint ?? null;
    if (sha256(snapshotText) !== scope.snapshot_sha256) {
      result.errors.push(
        scopeFailure(
          "/current_scope/snapshot_sha256",
          "scope snapshot content changed after confirmation",
          "scope-snapshot",
        ),
      );
    }
    const expectedSnapshotPath = path.posix.join(
      manifest.paths.convergence,
      "scopes",
      `${scope.scope_id}-${scope.scope_fingerprint}.json`,
    );
    if (scope.snapshot_path !== expectedSnapshotPath) {
      result.errors.push(
        scopeFailure(
          "/current_scope/snapshot_path",
          `scope snapshot path must be ${expectedSnapshotPath}`,
          "scope-snapshot",
        ),
      );
    }
    if (
      snapshot.scope_id !== scope.scope_id ||
      snapshot.scope_fingerprint !== scope.scope_fingerprint ||
      snapshot.status !== "confirmed"
    ) {
      result.errors.push(
        scopeFailure(
          "/current_scope/snapshot_path",
          "scope snapshot identity or confirmation status does not match the manifest",
          "scope-snapshot",
        ),
      );
    }
    if (!sameFiles(snapshot.files, scope.files)) {
      result.errors.push(
        scopeFailure(
          "/current_scope/files",
          "scope files, hashes, or confirmed reading order differ from the immutable snapshot",
          "scope-order",
        ),
      );
    }
    if (!sameStrings(snapshot.excluded_files, scope.excluded_files)) {
      result.errors.push(
        scopeFailure(
          "/current_scope/excluded_files",
          "scope exclusions differ from the immutable snapshot",
          "scope-exclusions",
        ),
      );
    }
    if (snapshot.author_confirmation?.reading_order_confirmed !== true) {
      result.errors.push(
        scopeFailure(
          "/current_scope/snapshot_path",
          "the author did not confirm the snapshot reading order",
          "scope-confirmation",
        ),
      );
    }
  } catch (error) {
    result.errors.push(
      scopeFailure(
        "/current_scope/snapshot_path",
        `cannot read a valid immutable scope snapshot: ${error.message}`,
        "scope-snapshot",
      ),
    );
  }

  let inventory;
  if (snapshot?.inventory) {
    try {
      const expectedInventoryPath = path.posix.join(
        manifest.paths.convergence,
        "inventories",
        `${snapshot.inventory.inventory_fingerprint}.json`,
      );
      if (snapshot.inventory.path !== expectedInventoryPath) {
        result.errors.push(
          scopeFailure(
            "/current_scope/snapshot_path",
            `inventory snapshot path must be ${expectedInventoryPath}`,
            "scope-inventory",
          ),
        );
      }
      const inventoryText = await readFile(
        path.resolve(projectRoot, snapshot.inventory.path),
        "utf8",
      );
      inventory = JSON.parse(inventoryText);
      result.errors.push(...validateInventorySnapshot(inventory).errors);
      if (inventory.manuscript_root !== manifest.manuscript_root) {
        result.errors.push(
          scopeFailure(
            "/current_scope/snapshot_path",
            "inventory snapshot manuscript_root does not match the manifest",
            "scope-inventory",
          ),
        );
      }
      if (sha256(inventoryText) !== snapshot.inventory.sha256) {
        result.errors.push(
          scopeFailure(
            "/current_scope/snapshot_path",
            "inventory snapshot content changed after scope confirmation",
            "scope-inventory",
          ),
        );
      }
      if (
        computeInventoryFingerprint(inventory) !== snapshot.inventory.inventory_fingerprint ||
        inventory.inventory_fingerprint !== snapshot.inventory.inventory_fingerprint
      ) {
        result.errors.push(
          scopeFailure(
            "/current_scope/snapshot_path",
            "inventory snapshot fingerprint does not match its canonical content",
            "scope-inventory",
          ),
        );
      }
      if (!sameStrings(inventory.excluded_files, snapshot.excluded_files)) {
        result.errors.push(
          scopeFailure(
            "/current_scope/excluded_files",
            "scope exclusions differ from its inventory evidence",
            "scope-exclusions",
          ),
        );
      }
      if (
        inventory.files.length !== snapshot.files.length ||
        !snapshot.files.every((file) =>
          inventory.files.some(
            (candidate) => candidate.path === file.path && candidate.sha256 === file.sha256,
          ),
        )
      ) {
        result.errors.push(
          scopeFailure(
            "/current_scope/files",
            "confirmed scope is not the complete manuscript in its inventory evidence",
            "scope-inventory",
          ),
        );
      }
    } catch (error) {
      result.errors.push(
        scopeFailure(
          "/current_scope/snapshot_path",
          `cannot read valid inventory evidence: ${error.message}`,
          "scope-inventory",
        ),
      );
    }
  }

  try {
    const current = await currentInventory(projectRoot, manifest);
    const scopeByPath = new Map(scope.files.map((file) => [file.path, file.sha256]));
    for (const file of current.files) {
      if (!scopeByPath.has(file.path)) {
        result.errors.push(
          scopeFailure(
            "/current_scope/files",
            `manuscript file is not registered in the current scope: ${file.path}`,
            "scope-inventory",
          ),
        );
      }
    }
    for (const [index, file] of scope.files.entries()) {
      const absolute = current.absoluteByPath.get(file.path);
      if (!absolute) {
        let message = `scope path is not a current manuscript-inventory path: ${file.path}`;
        try {
          await readFile(path.resolve(projectRoot, file.path));
        } catch (error) {
          message = `cannot read current manuscript ${file.path}: ${error.message}`;
        }
        result.errors.push(
          scopeFailure(
            `/current_scope/files/${index}/path`,
            message,
            "scope-inventory",
          ),
        );
        continue;
      }
      const currentHash = current.files.find((candidate) => candidate.path === file.path)?.sha256;
      if (currentHash !== file.sha256) {
        result.errors.push(
          scopeFailure(
            `/current_scope/files/${index}/sha256`,
            `manuscript content changed since the scope was recorded: ${file.path}`,
            "scope-currency",
          ),
        );
      }
    }
    if (
      !sameStrings(
        relevantExclusions(current.excludedFiles, manifest.paths),
        relevantExclusions(scope.excluded_files, manifest.paths),
      )
    ) {
      result.errors.push(
        scopeFailure(
          "/current_scope/excluded_files",
          "current non-operational manuscript exclusions changed after confirmation",
          "scope-exclusions",
        ),
      );
    }
  } catch (error) {
    result.errors.push(
      scopeFailure(
        "/current_scope/files",
        `cannot inventory current manuscript: ${error.message}`,
        "scope-inventory",
      ),
    );
  }

  result.valid = result.errors.length === 0;
  result.full_manuscript = result.valid;
  return result;
}

export function validateScopeSnapshot(value, options = {}) {
  const schema = validateScopeSnapshotSchema(value, options);
  const errors = [...schema.errors];
  if (Array.isArray(value?.files) && Array.isArray(value?.excluded_files)) {
    const expected = computeScopeFingerprint(value);
    if (value.scope_fingerprint !== expected) {
      errors.push(
        scopeFailure(
          "/scope_fingerprint",
          `scope_fingerprint does not match canonical content; expected ${expected}`,
          "scope-fingerprint",
        ),
      );
    }
    const paths = new Set();
    for (const [index, file] of value.files.entries()) {
      if (paths.has(file.path)) {
        errors.push(
          scopeFailure(
            `/files/${index}/path`,
            `duplicate manuscript path in scope snapshot: ${file.path}`,
            "scope-uniqueness",
          ),
        );
      }
      paths.add(file.path);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateInventorySnapshot(value, options = {}) {
  const schema = validateInventorySnapshotSchema(value, options);
  const errors = [...schema.errors];
  if (
    typeof value?.manuscript_root === "string" &&
    Array.isArray(value?.files) &&
    Array.isArray(value?.excluded_files)
  ) {
    const expected = computeInventoryFingerprint(value);
    if (value.inventory_fingerprint !== expected) {
      errors.push(
        scopeFailure(
          "/inventory_fingerprint",
          `inventory_fingerprint does not match canonical content; expected ${expected}`,
          "inventory-fingerprint",
        ),
      );
    }
    const paths = new Set();
    for (const [index, file] of value.files.entries()) {
      if (paths.has(file.path)) {
        errors.push(
          scopeFailure(
            `/files/${index}/path`,
            `duplicate manuscript path in inventory snapshot: ${file.path}`,
            "inventory-uniqueness",
          ),
        );
      }
      paths.add(file.path);
    }
  }
  return { valid: errors.length === 0, errors };
}
