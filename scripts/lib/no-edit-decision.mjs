import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateNoEditSkip, validateRequestedPass } from "./evaluation-contracts.mjs";
import { sha256Bytes } from "./state-io.mjs";

function commandError(code, message, details = {}) {
  const error = new Error(message);
  error.projectCode = code;
  error.projectDetails = details;
  return error;
}

function sameCurrentScope(passScope, currentScope) {
  return currentScope &&
    passScope.scope_id === currentScope.scope_id &&
    passScope.scope_fingerprint === currentScope.scope_fingerprint &&
    passScope.snapshot_path === currentScope.snapshot_path &&
    passScope.snapshot_sha256 === currentScope.snapshot_sha256;
}

async function readDecisionArtifact(project, reference, identityField) {
  let text;
  try {
    text = await readFile(path.resolve(project.root, reference.path), "utf8");
  } catch (error) {
    throw commandError("finding-decision-evidence-unavailable", `Cannot read decision evidence ${reference.path}: ${error.message}`);
  }
  if (sha256Bytes(text) !== reference.sha256) {
    throw commandError("finding-decision-evidence-mismatch", `Decision evidence hash differs: ${reference.path}`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw commandError("finding-decision-evidence-mismatch", `Decision evidence is not valid JSON: ${error.message}`);
  }
  if (value[identityField] !== reference[identityField]) {
    throw commandError("finding-decision-evidence-mismatch", `Decision evidence identity differs: ${reference.path}`);
  }
  return value;
}

export async function validateNoEditDecision(project, tracker, request, report, options = {}) {
  if (!["deferred", "dismissed"].includes(request.status) || request.revision_execution) {
    throw commandError("finding-decision-evidence-mismatch", "A no-edit skip supports only deferred or dismissed finding decisions.");
  }
  const skip = await readDecisionArtifact(project, request.no_edit_skip, "skip_id");
  const skipValidation = validateNoEditSkip(skip, options);
  if (!skipValidation.valid) {
    throw commandError("finding-decision-evidence-mismatch", "The no-edit skip is invalid.", {
      validation_errors: skipValidation.errors,
    });
  }
  if (
    skip.author_decision_id !== request.author_decision_id ||
    !skip.covered_findings.includes(request.finding_id)
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The no-edit skip does not cover this finding and author decision.");
  }
  const pass = await readDecisionArtifact(project, skip.requested_pass, "pass_id");
  const passValidation = validateRequestedPass(pass, options);
  if (!passValidation.valid || pass.pass_fingerprint !== skip.requested_pass.pass_fingerprint) {
    throw commandError("finding-decision-evidence-mismatch", "The no-edit skip requested pass is invalid.", {
      validation_errors: passValidation.errors,
    });
  }
  if (
    skip.scope_fingerprint !== pass.target_scope.scope_fingerprint ||
    !sameCurrentScope(pass.target_scope, project.manifest.current_scope)
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The no-edit skip is not bound to the current target scope.");
  }
  if (!pass.paths.includes(report.reported.location.file)) {
    throw commandError("finding-decision-evidence-mismatch", "The no-edit skip pass does not cover the finding location.");
  }
  const passReference = report.envelope.requested_pass;
  if (
    report.envelope.scope_id !== pass.target_scope.scope_id ||
    report.envelope.scope_fingerprint !== pass.target_scope.scope_fingerprint ||
    !passReference ||
    passReference.pass_id !== pass.pass_id ||
    passReference.pass_fingerprint !== pass.pass_fingerprint ||
    passReference.path !== skip.requested_pass.path ||
    passReference.sha256 !== skip.requested_pass.sha256
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The current report and no-edit skip name different pass or scope evidence.");
  }
  const decision = tracker.approvals.find((approval) => approval.id === request.author_decision_id);
  const tokens = String(decision?.reason ?? "").split(/\s+/).filter(Boolean);
  if (
    !decision ||
    decision.status !== "approved" ||
    decision.type !== "no-edit-skip" ||
    decision.scopeId !== pass.target_scope.scope_id ||
    !skip.operations.includes(decision.operation) ||
    !pass.paths.every((filePath) => decision.paths.includes(filePath)) ||
    !tokens.includes(`finding_id=${request.finding_id}`) ||
    !tokens.includes(`finding_status=${request.status}`)
  ) {
    throw commandError("finding-author-decision-missing", "The no-edit skip lacks its approved author decision for the finding, status, complete pass paths, and current scope.");
  }
}
