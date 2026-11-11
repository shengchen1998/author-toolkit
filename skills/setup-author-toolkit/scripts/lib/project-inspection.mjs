import { readFile } from "node:fs/promises";
import path from "node:path";

import { inspectExecutionReceipts } from "./execution-receipts.mjs";
import { validateManifest } from "./manifest.mjs";
import {
  projectRootFromManifest,
  validatePendingArtifactIndex,
  validateProjectFiles,
  validateScopeCurrency,
} from "./project-files.mjs";
import { trackerFindingRows, validateTracker } from "./tracker.mjs";

function failure(message) {
  return { valid: false, errors: [{ instancePath: "", message }] };
}

export async function inspectProjectManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return { valid: false, checks: [{ path: "manifest", ...failure(error.message) }] };
  }

  const checks = [];
  const check = (name, result) => {
    checks.push({ path: name, ...result });
    return result.valid;
  };

  if (!check("manifest", validateManifest(manifest))) {
    if (manifest?.schema_version !== "3.1.0" || manifest?.project_type !== "fiction") {
      checks[0].unsupported = true;
    }
    return { valid: false, checks };
  }

  check("files", await validateProjectFiles(manifest, manifestPath));
  if (manifest.pending_action?.artifact_index) {
    check("pending-artifacts", await validatePendingArtifactIndex(manifest, manifestPath));
  }
  if (manifest.current_scope) {
    check("scope", await validateScopeCurrency(manifest, manifestPath));
  }
  if (check("tracker", await validateTracker(manifest, manifestPath))) {
    check("executions", await inspectExecutionReceipts(manifest, manifestPath));
  }
  return { valid: checks.every((result) => result.valid), manifest, checks };
}

export async function inspectProjectStatus(manifest, manifestPath, { scopeId } = {}) {
  const trackerValidation = await validateTracker(manifest, manifestPath);
  if (!trackerValidation.valid) {
    throw new Error(
      `invalid tracker: ${trackerValidation.errors
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ")}`,
    );
  }
  const inspection = await inspectExecutionReceipts(manifest, manifestPath, { scopeId });
  if (!inspection.valid) {
    throw new Error(
      `invalid execution receipts: ${inspection.errors
        .map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ")}`,
    );
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  const tracker = await readFile(path.resolve(projectRoot, manifest.paths.audit_tracker), "utf8");
  const staleFindings = trackerFindingRows(tracker)
    .filter((finding) => finding.status.toLowerCase() === "stale")
    .map((finding) => ({
      finding_id: finding.id,
      operation: finding.stage,
      audit: finding.audit,
      location: finding.location,
      current_report: finding.report,
      updated: finding.updated,
      reason: finding.reason,
    }));
  const pending = manifest.pending_action;
  const blockedPending = pending?.status === "blocked" && (!scopeId || pending.scope_id === scopeId)
    ? { operation: pending.operation, scope_id: pending.scope_id, reason: pending.reason }
    : null;
  return {
    scope: manifest.current_scope
      ? { scope_id: manifest.current_scope.scope_id, status: manifest.current_scope.status }
      : null,
    pending_action: pending
      ? { operation: pending.operation, status: pending.status, scope_id: pending.scope_id }
      : null,
    execution: { scope_id: scopeId ?? null, ...inspection.summary },
    recorded_blockers: {
      stale_finding_count: staleFindings.length,
      stale_findings: staleFindings,
      blocked_pending_action: blockedPending,
    },
    evidence: { operation_specific: "not_evaluated" },
  };
}
