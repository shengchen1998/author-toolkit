import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { validatePendingArtifactIndex, validateProjectFiles } from "./project-files.mjs";
import { validateRelativePath } from "./schemas.mjs";

export const PENDING_ARTIFACT_INDEX = ".author-toolkit/pending-artifacts.json";
export const MAX_INLINE_PENDING_ARTIFACTS = 8;

export async function readPendingArtifactIndex(projectRoot) {
  return JSON.parse(await readFile(path.join(projectRoot, PENDING_ARTIFACT_INDEX), "utf8"));
}

export function preparePendingAction(manifest, values, updatedAt) {
  const artifacts = [...new Set(values.artifacts ?? [])];
  for (const artifact of artifacts) {
    if (!validateRelativePath(artifact).valid) throw new Error(`invalid pending artifact path: ${artifact}`);
  }
  const pending = {
    operation: values.operation,
    status: values.status,
    ...(values.scope_id ? { scope_id: values.scope_id } : {}),
    reason: values.reason,
    ...(artifacts.length > MAX_INLINE_PENDING_ARTIFACTS
      ? { artifacts: artifacts.slice(0, MAX_INLINE_PENDING_ARTIFACTS), artifact_index: PENDING_ARTIFACT_INDEX }
      : { artifacts }),
    updated_at: updatedAt,
  };
  const next = { ...manifest, pending_action: pending, updated_at: updatedAt };
  const validation = validateManifest(next);
  if (!validation.valid) {
    throw new Error(validation.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
  }
  const index = pending.artifact_index
    ? {
        schema_version: "1.0.0",
        operation: pending.operation,
        ...(pending.scope_id ? { scope_id: pending.scope_id } : {}),
        artifacts,
        updated_at: updatedAt,
      }
    : null;
  return { manifest: next, index };
}

async function writeAtomic(file, value) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function setPendingAction(projectRoot, values, updatedAt = new Date().toISOString()) {
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const prepared = preparePendingAction(manifest, values, updatedAt);
  const baseManifestValidation = validateManifest(manifest);
  if (!baseManifestValidation.valid) throw new Error("existing manifest is invalid");
  const files = await validateProjectFiles(prepared.manifest, manifestPath, { skipPendingArtifacts: Boolean(prepared.index) });
  if (!files.valid) {
    throw new Error(files.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
  }
  const previousIndex = prepared.index
    ? await readFile(path.join(projectRoot, PENDING_ARTIFACT_INDEX), "utf8").catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      })
    : null;
  if (prepared.index) {
    const validation = await validatePendingArtifactIndex(prepared.manifest, manifestPath, prepared.index);
    if (!validation.valid) {
      throw new Error(validation.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
    }
    await mkdir(path.join(projectRoot, ".author-toolkit"), { recursive: true });
    await writeAtomic(path.join(projectRoot, PENDING_ARTIFACT_INDEX), prepared.index);
  }
  let previousManifest;
  try {
    previousManifest = await readFile(manifestPath, "utf8");
    await writeAtomic(manifestPath, prepared.manifest);
  } catch (error) {
    if (prepared.index) {
      const indexPath = path.join(projectRoot, PENDING_ARTIFACT_INDEX);
      if (previousIndex === null) await rm(indexPath, { force: true });
      else await writeFile(indexPath, previousIndex, "utf8");
    }
    if (previousManifest !== undefined) {
      await writeFile(manifestPath, previousManifest, "utf8").catch(() => {});
    }
    throw error;
  }
  return prepared;
}
