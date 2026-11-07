import { readFile } from "node:fs/promises";
import path from "node:path";

import { readActiveCycle } from "./evaluation-artifacts.mjs";
import {
  passRequirements,
  samePassReference,
  validateRequestedPass,
} from "./evaluation-contracts.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
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

export async function validateStaleDecision(project, tracker, request, report, existing, options = {}) {
  if (request.revision_execution || request.no_edit_skip) {
    throw commandError("finding-decision-evidence-mismatch", "A stale decision uses its equivalent current report, not execution or no-edit evidence.");
  }
  for (const input of report.envelope.inputs) {
    if (input.version_type !== "sha256") {
      throw commandError("finding-decision-evidence-mismatch", "A stale decision requires SHA-256 input versions in the current report.");
    }
    let contents;
    try {
      contents = await readFile(path.resolve(project.root, input.path));
    } catch (error) {
      throw commandError("finding-decision-evidence-unavailable", `Cannot read current report input ${input.path}: ${error.message}`);
    }
    if (sha256Bytes(contents) !== input.version) {
      throw commandError("finding-decision-evidence-mismatch", `Current report input hash differs: ${input.path}`);
    }
  }
  const currentScope = project.manifest.current_scope;
  const passReference = report.envelope.requested_pass;
  if (
    !currentScope ||
    currentScope.status !== "confirmed" ||
    report.envelope.scope_id !== currentScope.scope_id ||
    report.envelope.scope_fingerprint !== currentScope.scope_fingerprint ||
    !passReference
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The stale rerun is not bound to the complete current scope and requested-pass identity.");
  }
  let pass;
  try {
    pass = await readDecisionArtifact(project, passReference, "pass_id");
  } catch (error) {
    throw commandError("finding-decision-evidence-mismatch", error.message);
  }
  const passValidation = validateRequestedPass(pass, options);
  if (
    !passValidation.valid ||
    !samePassReference(passReference, {
      pass_id: pass.pass_id,
      pass_fingerprint: pass.pass_fingerprint,
      path: passReference.path,
      sha256: passReference.sha256,
    }) ||
    !sameCurrentScope(pass.target_scope, currentScope)
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The stale rerun requested pass is invalid or is not bound to the current target scope.", {
      validation_errors: passValidation.errors,
    });
  }
  const activeCycle = await readActiveCycle(project);
  if (activeCycle && !samePassReference(passReference, activeCycle.value.requested_pass)) {
    throw commandError("finding-decision-evidence-mismatch", "The stale rerun requested pass differs from the active cycle's requested pass.");
  }
  const originalReport = options.originalReport ?? existing.report;
  let originalFinding;
  try {
    const originalValidation = validateEvidenceReport(
      await readFile(path.resolve(project.root, originalReport), "utf8"),
      options,
    );
    originalFinding = originalValidation.envelope?.findings.find((finding) => finding.id === existing.id);
    if (
      !originalValidation.valid ||
      !originalFinding ||
      originalFinding.audit !== existing.audit ||
      findingLocation(originalFinding.location) !== existing.location
    ) {
      throw new Error("The tracked finding is not preserved in its original report.");
    }
  } catch (error) {
    throw commandError("finding-decision-evidence-mismatch", `Cannot prove the original finding technique: ${error.message}`);
  }
  const requirement = passRequirements(pass, existing.stage);
  const reportInputs = new Map(report.envelope.inputs.map((input) => [input.path, input]));
  const reportSubchecks = report.envelope.engine.notes.match(/(?:^|\s)subchecks=([^\s]+)/)?.[1]?.split(",") ?? [];
  if (
    !requirement ||
    !requirement.subchecks.includes(originalFinding.technique) ||
    requirement.subchecks.some((subcheck) => !reportSubchecks.includes(subcheck)) ||
    requirement.paths.some((filePath) => !reportInputs.has(filePath))
  ) {
    throw commandError("finding-decision-evidence-mismatch", "The stale rerun does not cover the complete operation paths and subchecks, including the finding technique.");
  }

  const decision = tracker.approvals.find((approval) => approval.id === request.author_decision_id);
  const tokens = String(decision?.reason ?? "").split(/\s+/).filter(Boolean);
  const expectedTokens = {
    finding_id: request.finding_id,
    finding_status: request.status,
    scope_fingerprint: currentScope.scope_fingerprint,
    pass_id: pass.pass_id,
    pass_fingerprint: pass.pass_fingerprint,
    pass_path: encodeURIComponent(passReference.path),
    pass_sha256: passReference.sha256,
  };
  const bindingsValid = Object.entries(expectedTokens).every(([name, value]) =>
    tokens.filter((token) => token.startsWith(`${name}=`)).length === 1 &&
    tokens.includes(`${name}=${value}`)
  );
  if (
    !decision ||
    decision.status !== "approved" ||
    decision.type !== "finding-decision" ||
    decision.operation !== existing.stage ||
    decision.scopeId !== currentScope.scope_id ||
    !report.envelope.inputs.every((input) => decision.paths.includes(input.path)) ||
    !bindingsValid
  ) {
    throw commandError("finding-author-decision-missing", "A stale decision requires an approved finding-decision bound to the finding, status, operation, complete current scope, requested pass, and complete report inputs.");
  }
}
