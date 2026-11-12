import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { inspectExecutionReceipts } from "./execution-receipts.mjs";
import { validateManifest } from "./manifest.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import { validateExecutionEvidenceSchema } from "./schemas.mjs";
import { reconcileExecutions } from "./write-operations.mjs";

const candidateLimit = 12;
const skippedDirectories = new Set([".git", "node_modules"]);

async function evidenceCandidates(projectRoot, approvalIds) {
  const candidates = [];
  const result = {
    scanned_file_count: 0,
    evidence_file_count: 0,
    candidate_file_count: 0,
    invalid_json_count: 0,
    invalid_evidence_count: 0,
  };

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) await visit(absolute);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
      result.scanned_file_count += 1;
      let value;
      try {
        value = JSON.parse(await readFile(absolute, "utf8"));
      } catch {
        result.invalid_json_count += 1;
        continue;
      }
      const validation = validateExecutionEvidenceSchema(value);
      if (!validation.valid) {
        if (value && typeof value === "object" && !Array.isArray(value) && ("completed_at" in value || "backup_ids" in value)) {
          result.invalid_evidence_count += 1;
        }
        continue;
      }
      result.evidence_file_count += 1;
      if (!approvalIds.has(value.approval_id)) continue;
      result.candidate_file_count += 1;
      candidates.push({
        path: path.relative(projectRoot, absolute).replaceAll(path.sep, "/"),
        approval_id: value.approval_id,
      });
    }
  }

  await visit(projectRoot);
  return { candidates, result };
}

export async function auditExecutionRecovery(manifest, manifestPath, { scopeId } = {}) {
  const result = {
    status: "unavailable",
    read_only: true,
    scope_id: scopeId ?? null,
    unverified_count: null,
    reconcilable_count: null,
    unsupported_count: null,
    current_draft_revision_convergence: "not_established",
    next_action: "resolve_project_validation",
    candidates: [],
    errors: [],
  };
  if (!validateManifest(manifest).valid) {
    result.errors.push("a valid v3.1 manifest is required before execution recovery can be audited");
    return result;
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  let inspection;
  try {
    inspection = await inspectExecutionReceipts(manifest, manifestPath);
  } catch (error) {
    result.errors.push(error.message);
    return result;
  }
  if (!inspection.valid) {
    result.errors.push("execution receipts or backup identities are invalid; resolve those diagnostics before auditing recovery");
    return result;
  }
  const unverified = inspection.summary.unverified.filter((approval) => !scopeId || approval.scope_id === scopeId);
  result.unverified_count = unverified.length;
  if (unverified.length === 0) {
    result.status = "not_required";
    result.reconcilable_count = 0;
    result.unsupported_count = 0;
    result.next_action = "evaluate_remaining_convergence_conditions";
    return result;
  }

  const { candidates, result: scan } = await evidenceCandidates(
    projectRoot,
    new Set(unverified.map((approval) => approval.approval_id)),
  );
  Object.assign(result, scan);
  let preview;
  try {
    preview = candidates.length > 0
      ? await reconcileExecutions(manifestPath, {
          evidence: candidates.map((candidate) => candidate.path),
          recordedAt: new Date().toISOString(),
        })
      : { reconciled: [], rejected: [] };
  } catch (error) {
    Object.assign(result, {
      unverified_count: null,
      reconcilable_count: null,
      unsupported_count: null,
      status: "unavailable",
      next_action: "resolve_project_validation",
    });
    result.errors.push(error.message);
    return result;
  }
  const reconciled = new Set(preview.reconciled);
  const rejected = new Map(preview.rejected.map((candidate) => [candidate.path, candidate.reason]));
  const displayed = candidates.map((candidate) => ({
    ...candidate,
    status: rejected.has(candidate.path) ? "rejected" : "reconcilable",
    ...(rejected.has(candidate.path) ? { reason: rejected.get(candidate.path) } : {}),
  }));
  result.status = "available";
  result.reconcilable_count = unverified.filter((approval) => reconciled.has(approval.approval_id)).length;
  result.unsupported_count = result.unverified_count - result.reconcilable_count;
  result.next_action = result.reconcilable_count > 0
    ? "preview_reconciliation_then_rerun_strict_gate"
    : "author_decision_required";
  result.candidates = displayed.slice(0, candidateLimit);
  if (displayed.length > candidateLimit) result.omitted_candidate_count = displayed.length - candidateLimit;
  return result;
}
