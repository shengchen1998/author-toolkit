import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { collectManuscriptInventory } from "./manuscript.mjs";
import { validatePendingArtifactsSchema, validateRelativePath } from "./schemas.mjs";

const OPERATIONAL_PATHS = [
  "story_bible",
  "audit_tracker",
  "reports",
  "sessions",
  "backups",
  "handoffs",
  "creation",
];

function fileError(instancePath, message) {
  return { instancePath, keyword: "filesystem", message, params: {} };
}

function scopeError(instancePath, message) {
  return { instancePath, keyword: "scope-currency", message, params: {} };
}

export function projectRootFromManifest(manifestPath) {
  const directory = path.dirname(path.resolve(manifestPath));
  return path.basename(directory) === ".author-toolkit" ? path.dirname(directory) : directory;
}

export function isUninitializedProjectTemplate(manifest) {
  return (
    manifest.language === "und" &&
    manifest.created_at === "2000-01-01T00:00:00Z" &&
    manifest.updated_at === "2000-01-01T00:00:00Z"
  );
}

async function checkExists(root, instancePath, relativePath) {
  if (!validateRelativePath(relativePath).valid) {
    return fileError(instancePath, "project path must be a portable project-relative path");
  }

  try {
    await stat(path.resolve(root, relativePath));
    return null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return fileError(instancePath, `required project path does not exist: ${relativePath}`);
    }
    return fileError(instancePath, `cannot access project path ${relativePath}: ${error.message}`);
  }
}

export async function validateProjectFiles(manifest, manifestPath, { skipPendingArtifacts = false } = {}) {
  const projectRoot = projectRootFromManifest(manifestPath);
  if (isUninitializedProjectTemplate(manifest)) {
    return { valid: true, errors: [], projectRoot };
  }

  const checks = [["/manuscript_root", manifest.manuscript_root]];
  for (const name of OPERATIONAL_PATHS) {
    checks.push([`/paths/${name}`, manifest.paths?.[name]]);
  }

  if (!skipPendingArtifacts) {
    manifest.pending_action?.artifacts?.forEach((artifact, artifactIndex) => {
      checks.push([`/pending_action/artifacts/${artifactIndex}`, artifact]);
    });
  }
  manifest.current_scope?.files?.forEach((file, fileIndex) => {
    checks.push([`/current_scope/files/${fileIndex}/path`, file.path]);
  });

  const errors = [];
  for (const [instancePath, relativePath] of checks) {
    const error = await checkExists(projectRoot, instancePath, relativePath);
    if (error) errors.push(error);
  }

  return { valid: errors.length === 0, errors, projectRoot };
}

export async function validatePendingArtifactIndex(manifest, manifestPath, suppliedIndex) {
  const pending = manifest.pending_action;
  if (!pending?.artifact_index) return { valid: true, errors: [] };
  const projectRoot = projectRootFromManifest(manifestPath);
  let index = suppliedIndex;
  if (index === undefined) {
    try {
      index = JSON.parse(await readFile(path.resolve(projectRoot, pending.artifact_index), "utf8"));
    } catch (error) {
      return {
        valid: false,
        errors: [fileError("/pending_action/artifact_index", `cannot read pending artifact index: ${error.message}`)],
      };
    }
  }

  const result = validatePendingArtifactsSchema(index);
  const errors = result.errors.map((error) => ({
    ...error,
    instancePath: `/pending_action/artifact_index${error.instancePath}`,
  }));
  if (index.operation !== pending.operation) {
    errors.push(fileError("/pending_action/artifact_index/operation", "index operation must match pending action"));
  }
  if ((index.scope_id ?? null) !== (pending.scope_id ?? null)) {
    errors.push(fileError("/pending_action/artifact_index/scope_id", "index scope ID must match pending action"));
  }
  if (index.updated_at !== pending.updated_at) {
    errors.push(fileError("/pending_action/artifact_index/updated_at", "index timestamp must match pending action"));
  }
  if (index.updated_at !== manifest.updated_at) {
    errors.push(fileError("/pending_action/artifact_index/updated_at", "index timestamp must match manifest update time"));
  }
  const inline = pending.artifacts ?? [];
  if (!Array.isArray(index.artifacts) || inline.some((artifact, position) => index.artifacts[position] !== artifact)) {
    errors.push(fileError("/pending_action/artifacts", "inline artifacts must be a prefix of the pending artifact index"));
  }
  const indexedArtifacts = Array.isArray(index.artifacts) ? index.artifacts : [];
  for (const artifactIndex of inline.keys()) {
    if (indexedArtifacts[artifactIndex] === inline[artifactIndex]) continue;
    errors.push(fileError(`/pending_action/artifact_index/artifacts/${artifactIndex}`, "inline artifact must match the pending artifact index"));
  }
  for (const [artifactIndex, artifact] of indexedArtifacts.entries()) {
    const error = await checkExists(projectRoot, `/pending_action/artifact_index/artifacts/${artifactIndex}`, artifact);
    if (error) errors.push(error);
  }
  return { valid: errors.length === 0, errors };
}

export async function validateScopeCurrency(manifest, manifestPath) {
  const projectRoot = projectRootFromManifest(manifestPath);
  if (
    !manifest.current_scope ||
    isUninitializedProjectTemplate(manifest)
  ) {
    return { valid: true, errors: [], projectRoot };
  }

  const errors = [];
  for (const [index, file] of manifest.current_scope.files.entries()) {
    const instancePath = `/current_scope/files/${index}`;
    if (!validateRelativePath(file.path).valid) {
      errors.push(scopeError(`${instancePath}/path`, "scope path must be project-relative"));
      continue;
    }
    try {
      const contents = await readFile(path.resolve(projectRoot, file.path));
      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual !== file.sha256) {
        errors.push(
          scopeError(
            `${instancePath}/sha256`,
            `manuscript content changed since the scope was recorded: ${file.path}`,
          ),
        );
      }
    } catch (error) {
      errors.push(
        scopeError(
          `${instancePath}/path`,
          `cannot read current manuscript ${file.path}: ${error.message}`,
        ),
      );
    }
  }

  try {
    const inventory = await collectManuscriptInventory(
      projectRoot,
      manifest.manuscript_root,
      manifest.paths,
    );
    const actualPaths = inventory.files.map((file) => file.path);
    const recordedPaths = new Set(manifest.current_scope.files.map((file) => file.path));
    for (const filePath of actualPaths) {
      if (!recordedPaths.has(filePath)) {
        errors.push(
          scopeError(
            "/current_scope/files",
            `manuscript file is not registered in the current scope: ${filePath}`,
          ),
        );
      }
    }
  } catch (error) {
    errors.push(
      scopeError("/current_scope/files", `cannot inventory current manuscript: ${error.message}`),
    );
  }

  return { valid: errors.length === 0, errors, projectRoot };
}
