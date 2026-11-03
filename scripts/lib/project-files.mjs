import { stat } from "node:fs/promises";
import path from "node:path";

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

  for (const name of OPERATIONAL_PATHS) {
    checks.push([`/paths/${name}`, manifest.paths?.[name]]);
  }

  manifest.workflow?.stages?.forEach((stage, stageIndex) => {
    stage.artifacts?.forEach((artifact, artifactIndex) => {
      checks.push([
        `/workflow/stages/${stageIndex}/artifacts/${artifactIndex}`,
        artifact,
      ]);
    });
  });

  const errors = [];
  for (const [instancePath, relativePath] of checks) {
    const error = await checkExists(projectRoot, instancePath, relativePath);
    if (error) errors.push(error);
  }

  return { valid: errors.length === 0, errors, projectRoot };
}
