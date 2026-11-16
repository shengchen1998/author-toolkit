import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { collectManuscriptInventory } from "./manuscript.mjs";
import { inspectManifestValue, inspectProjectManifest } from "./project-inspection.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { sha256, writeJsonAtomic } from "./state-files.mjs";
import { withProjectWriteLock } from "./write-lock.mjs";

function validationDetails(inspection) {
  return inspection.checks
    .filter((check) => !check.valid)
    .flatMap((check) => check.errors.map((error) => `${check.path}: ${error.instancePath || "/"} ${error.message}`))
    .join("; ");
}

function assertUniquePortablePaths(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (!validateRelativePath(value).valid) {
      throw new Error(`${label} must be a portable project-relative path: ${value}`);
    }
    if (seen.has(value)) throw new Error(`${label} is duplicated: ${value}`);
    seen.add(value);
  }
}

function sameScopeIdentity(current, files, excludedFiles) {
  return JSON.stringify(current.files.map((file) => file.path)) === JSON.stringify(files) &&
    JSON.stringify(current.excluded_files) === JSON.stringify(excludedFiles);
}

async function assertNonManuscriptExclusions(projectRoot, manifest, excludedFiles) {
  const inventory = await collectManuscriptInventory(projectRoot, manifest.manuscript_root, manifest.paths);
  const available = new Set(inventory.excludedFiles);
  for (const file of excludedFiles) {
    if (!available.has(file)) {
      throw new Error(`scope exclusion is not a non-manuscript inventory exclusion: ${file}`);
    }
  }
}

async function scopeWithCurrentHashes(projectRoot, files) {
  const result = [];
  for (const file of files) {
    let contents;
    try {
      contents = await readFile(path.resolve(projectRoot, file));
    } catch (error) {
      throw new Error(`cannot read scope file ${file}: ${error.message}`);
    }
    result.push({ path: file, sha256: sha256(contents) });
  }
  return result;
}

async function proposedManifest(manifest, projectRoot, selection, timestamp) {
  const files = selection.files;
  const excludedFiles = selection.excludedFiles ?? [];
  assertUniquePortablePaths(files, "scope file");
  assertUniquePortablePaths(excludedFiles, "scope exclusion");
  const current = manifest.current_scope;
  if (
    current?.status === "confirmed" &&
    current.scope_id === selection.scopeId &&
    !sameScopeIdentity(current, files, excludedFiles)
  ) {
    throw new Error("membership, reading order, or exclusion changes require a new scope ID");
  }
  await assertNonManuscriptExclusions(projectRoot, manifest, excludedFiles);
  const currentScope = {
    scope_id: selection.scopeId,
    description: selection.description,
    status: "proposed",
    files: await scopeWithCurrentHashes(projectRoot, files),
    excluded_files: excludedFiles,
    created_at: timestamp,
  };
  return { ...manifest, current_scope: currentScope, updated_at: timestamp };
}

async function confirmedManifest(manifest, projectRoot, selection, timestamp) {
  const current = manifest.current_scope;
  if (!current || current.status !== "proposed" || current.scope_id !== selection.scopeId) {
    throw new Error("scope confirmation requires the matching proposed current scope");
  }
  await assertNonManuscriptExclusions(projectRoot, manifest, current.excluded_files);
  for (const file of current.files) {
    let contents;
    try {
      contents = await readFile(path.resolve(projectRoot, file.path));
    } catch (error) {
      throw new Error(`cannot read current manuscript ${file.path}: ${error.message}`);
    }
    if (sha256(contents) !== file.sha256) {
      throw new Error(`manuscript content changed since the scope was recorded: ${file.path}`);
    }
  }
  return {
    ...manifest,
    current_scope: { ...current, status: "confirmed" },
    updated_at: timestamp,
  };
}

export async function recordScope({
  manifestPath,
  manifest,
  scopeId,
  description,
  files = [],
  excludedFiles = [],
  createdAt,
  updatedAt,
  confirm = false,
}) {
  const projectRoot = projectRootFromManifest(manifestPath);
  return withProjectWriteLock(manifestPath, manifest, async () => {
    const recorded = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validateManifest(recorded).valid || JSON.stringify(recorded) !== JSON.stringify(manifest)) {
      throw new Error("project manifest changed before scope recording; reread it before retrying");
    }
    const timestamp = (confirm ? updatedAt : createdAt) ?? new Date().toISOString();
    const next = confirm
      ? await confirmedManifest(recorded, projectRoot, { scopeId }, timestamp)
      : await proposedManifest(recorded, projectRoot, { scopeId, description, files, excludedFiles }, timestamp);
    const candidate = await inspectManifestValue(next, manifestPath);
    if (!candidate.valid) {
      throw new Error(`scope candidate failed project validation: ${validationDetails(candidate)}`);
    }
    await writeJsonAtomic(manifestPath, next);
    const published = await inspectProjectManifest(manifestPath);
    if (!published.valid || JSON.stringify(published.manifest) !== JSON.stringify(next)) {
      throw new Error(`published scope failed verification: ${validationDetails(published)}`);
    }
    return { manifest: published.manifest, current_scope: published.manifest.current_scope };
  });
}
