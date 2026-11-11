import { unverifiedOperationGroups } from "./execution-summary.mjs";
import { readPendingArtifactIndex } from "./pending-artifacts.mjs";

const errorLimit = 12;

export function concise(value, limit = 240) {
  const characters = [...String(value).replace(/\s+/g, " ").trim()];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

export function failedCheck(check, details) {
  if (details) return check;
  const result = {
    path: check.path,
    valid: false,
    errors: check.errors.slice(0, errorLimit).map((error) => ({
      ...error,
      message: concise(error.message),
    })),
  };
  if (check.unsupported) result.unsupported = true;
  if (check.errors.length > errorLimit) result.omitted_error_count = check.errors.length - errorLimit;
  if (check.summary) {
    const { unverified, ...summary } = check.summary;
    result.summary = {
      ...summary,
      unverified_by_operation: unverifiedOperationGroups(unverified),
    };
  }
  return result;
}

export async function manifestProjection(manifest, projectRoot, { diagnostic = false } = {}) {
  const pending = manifest.pending_action;
  let artifactCount = pending?.artifacts?.length ?? 0;
  let artifactCountError = null;
  if (pending?.artifact_index) {
    try {
      const index = await readPendingArtifactIndex(projectRoot);
      artifactCount = Array.isArray(index.artifacts) ? index.artifacts.length : null;
      if (artifactCount === null) artifactCountError = "pending artifact index has no artifacts array";
    } catch (error) {
      if (!diagnostic) throw error;
      artifactCount = null;
      artifactCountError = concise(error.message);
    }
  }
  return {
    schema_version: manifest.schema_version,
    project_type: manifest.project_type,
    language: manifest.language,
    manuscript_root: manifest.manuscript_root,
    paths: manifest.paths,
    current_scope: manifest.current_scope
      ? {
          ...manifest.current_scope,
          description: concise(manifest.current_scope.description),
          files: manifest.current_scope.files.map((file) => ({ ...file, path: concise(file.path) })),
          excluded_files: manifest.current_scope.excluded_files.map(concise),
        }
      : null,
    pending_action: pending
      ? {
          operation: pending.operation,
          status: pending.status,
          scope_id: pending.scope_id ?? null,
          reason: concise(pending.reason),
          artifacts: (pending.artifacts ?? []).slice(0, 2).map(concise),
          artifact_count: artifactCount,
          ...(artifactCountError ? { artifact_count_error: artifactCountError } : {}),
          artifact_index: pending.artifact_index ?? null,
          updated_at: pending.updated_at,
        }
      : null,
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
  };
}
