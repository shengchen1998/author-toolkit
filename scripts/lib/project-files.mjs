import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { V3_SCHEMA_VERSIONS } from "./constants.mjs";
import { collectManuscriptInventory } from "./manuscript.mjs";
import { validateRelativePath } from "./schemas.mjs";

const OPERATIONAL_PATHS = [
  "story_bible",
  "audit_tracker",
  "reports",
  "sessions",
  "backups",
  "handoffs",
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

export async function validateProjectFiles(manifest, manifestPath) {
  const projectRoot = projectRootFromManifest(manifestPath);
  if (isUninitializedProjectTemplate(manifest)) {
    return { valid: true, errors: [], projectRoot };
  }

  const checks = [["/manuscript_root", manifest.manuscript_root]];
  const operationalPaths = [...OPERATIONAL_PATHS];
  if (["3.1.0", "3.2.0"].includes(manifest.schema_version)) operationalPaths.push("creation");
  if (manifest.schema_version === "3.2.0") operationalPaths.push("convergence");

  for (const name of operationalPaths) {
    checks.push([`/paths/${name}`, manifest.paths?.[name]]);
  }

  if (V3_SCHEMA_VERSIONS.has(manifest.schema_version)) {
    manifest.pending_action?.artifacts?.forEach((artifact, artifactIndex) => {
      checks.push([`/pending_action/artifacts/${artifactIndex}`, artifact]);
    });
    manifest.current_scope?.files?.forEach((file, fileIndex) => {
      checks.push([`/current_scope/files/${fileIndex}/path`, file.path]);
    });
  } else {
    manifest.workflow?.stages?.forEach((stage, stageIndex) => {
      stage.artifacts?.forEach((artifact, artifactIndex) => {
        checks.push([
          `/workflow/stages/${stageIndex}/artifacts/${artifactIndex}`,
          artifact,
        ]);
      });
    });
  }

  const errors = [];
  for (const [instancePath, relativePath] of checks) {
    const error = await checkExists(projectRoot, instancePath, relativePath);
    if (error) errors.push(error);
  }

  return { valid: errors.length === 0, errors, projectRoot };
}

export async function validateScopeCurrency(manifest, manifestPath) {
  const projectRoot = projectRootFromManifest(manifestPath);
  if (
    !V3_SCHEMA_VERSIONS.has(manifest.schema_version) ||
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
