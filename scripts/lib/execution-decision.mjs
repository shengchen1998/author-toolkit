import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateRevisionExecutionAgainstDisk } from "./revision-execution.mjs";
import { sha256Bytes } from "./state-io.mjs";

function commandError(code, message, details = {}) {
  const error = new Error(message);
  error.projectCode = code;
  error.projectDetails = details;
  return error;
}

function findingLocation(location) {
  if (location.scope === "file") return location.file;
  if (location.scope === "chapter") return `${location.file}#chapter-${location.chapter}`;
  if (location.scope === "line") return `${location.file}:${location.line}`;
  return `${location.file}: ${location.quote}`;
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

export async function validateExecutionDecision(project, tracker, request, report, existing, options = {}) {
  if (request.no_edit_skip) {
    throw commandError("finding-decision-evidence-mismatch", "Choose exactly one current evidence record for a finding decision.");
  }
  const execution = await readDecisionArtifact(project, request.revision_execution, "execution_id");
  if (execution.status !== "verified") {
    throw commandError("finding-decision-evidence-mismatch", "A finding decision requires a verified revision execution.");
  }
  const expectedDisposition = {
    resolved: "execute",
    deferred: "defer",
    dismissed: "dismiss",
  }[request.status];
  if (!expectedDisposition) {
    throw commandError("finding-decision-evidence-mismatch", "Revision execution evidence does not support a stale decision.");
  }
  const disposition = execution.finding_dispositions.find((candidate) =>
    candidate.finding_id === request.finding_id && candidate.disposition === expectedDisposition
  );
  if (!disposition || disposition.author_decision_id !== request.author_decision_id) {
    throw commandError("finding-decision-evidence-mismatch", "The execution lacks this finding disposition and author decision.");
  }
  const disk = await validateRevisionExecutionAgainstDisk(project.root, execution, {
    expectedPass: execution.requested_pass,
    expectedScope: execution.target_scope,
    requireOutputs: true,
    requireCurrentTarget: true,
    requireCurrentDecisions: true,
    pendingFindingDecision: options.pendingFindingDecision,
    trackerState: tracker,
    now: options.now,
  });
  if (!disk.valid) {
    throw commandError("finding-decision-evidence-mismatch", "The verified execution is not current for its approved inputs, decisions, outputs, and target.", {
      validation_errors: disk.errors,
    });
  }
  const passReference = report.envelope.requested_pass;
  if (
    report.envelope.scope_id !== execution.target_scope.scope_id ||
    report.envelope.scope_fingerprint !== execution.target_scope.scope_fingerprint ||
    !passReference ||
    passReference.pass_id !== execution.requested_pass.pass_id ||
    passReference.pass_fingerprint !== execution.requested_pass.pass_fingerprint ||
    passReference.path !== execution.requested_pass.path ||
    passReference.sha256 !== execution.requested_pass.sha256
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The current report and revision execution name different pass or scope evidence.");
  }
  if (
    report.reported &&
    (report.reported.audit !== existing.audit || findingLocation(report.reported.location) !== existing.location)
  ) {
    throw commandError("finding-decision-report-mismatch", "The current report finding has a different audit or location.");
  }
}
