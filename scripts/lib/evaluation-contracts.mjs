import {
  validateConvergenceEvaluationSchema,
  validateNoEditSkipSchema,
  validateRequestedPassSchema,
  validateReviewGroupSchema,
  validateSemanticAttestationSchema,
} from "./schemas.mjs";
import { sha256Bytes } from "./state-io.mjs";

export const COVERAGE_OPERATIONS = ["diagnostics", "characters", "prose", "ai-cleanup"];
export const PERSPECTIVES = ["intent", "standards", "fresh"];
export const DEFAULT_ACTION = Object.freeze({
  strategy: "revise-draft",
  operation: "intake",
  command: "revise-draft",
});

function artifactError(instancePath, message, keyword = "convergence-artifact") {
  return { instancePath, keyword, message, params: {} };
}

export function sameReference(left, right) {
  return left?.path === right?.path && left?.sha256 === right?.sha256;
}

export function samePassReference(left, right) {
  return sameReference(left, right) &&
    left?.pass_id === right?.pass_id &&
    left?.pass_fingerprint === right?.pass_fingerprint;
}

export function sameScopeReference(left, right) {
  return left?.scope_id === right?.scope_id &&
    left?.scope_fingerprint === right?.scope_fingerprint &&
    left?.snapshot_path === right?.snapshot_path &&
    left?.snapshot_sha256 === right?.snapshot_sha256;
}

function canonicalPassContent(pass) {
  return {
    target_scope: {
      scope_id: pass.target_scope.scope_id,
      scope_fingerprint: pass.target_scope.scope_fingerprint,
    },
    required_operations: pass.required_operations,
    paths: pass.paths,
    language: pass.language,
    dependencies: pass.dependencies,
    inapplicability: pass.inapplicability,
    narrowing: pass.narrowing
      ? { reason: pass.narrowing.reason, gaps: pass.narrowing.gaps }
      : null,
    baseline_pass: pass.baseline_pass
      ? {
          pass_id: pass.baseline_pass.pass_id,
          pass_fingerprint: pass.baseline_pass.pass_fingerprint,
        }
      : null,
    requested_subchecks: pass.requested_subchecks.map(({ operation, subcheck }) => ({
      operation,
      subcheck,
    })),
  };
}

export function computeRequestedPassFingerprint(pass) {
  return sha256Bytes(JSON.stringify(canonicalPassContent(pass)));
}

export function deriveRequestedPassBaseline(lastSatisfiedFullPass, newRequests = []) {
  const operations = new Map();
  for (const requirement of lastSatisfiedFullPass?.required_operations ?? []) {
    operations.set(requirement.operation, {
      operation: requirement.operation,
      paths: [...requirement.paths],
      subchecks: new Set(requirement.subchecks),
    });
  }
  for (const request of newRequests) {
    if (!operations.has(request.operation)) {
      operations.set(request.operation, {
        operation: request.operation,
        paths: [...(request.paths ?? lastSatisfiedFullPass?.paths ?? [])],
        subchecks: new Set(),
      });
    }
    operations.get(request.operation).subchecks.add(request.subcheck);
  }
  return [...operations.values()].map((requirement) => ({
    operation: requirement.operation,
    paths: requirement.paths,
    subchecks: [...requirement.subchecks].sort(),
  }));
}

export function validateRequestedPass(value, options = {}) {
  const schema = validateRequestedPassSchema(value, options);
  const errors = [...schema.errors];
  if (
    value?.target_scope &&
    Array.isArray(value?.required_operations) &&
    Array.isArray(value?.paths) &&
    Array.isArray(value?.dependencies) &&
    Array.isArray(value?.inapplicability) &&
    Array.isArray(value?.requested_subchecks)
  ) {
    const expected = computeRequestedPassFingerprint(value);
    if (value.pass_fingerprint !== expected) {
      errors.push(artifactError(
        "/pass_fingerprint",
        `pass_fingerprint must match canonical requested-pass content: ${expected}`,
        "requested-pass-fingerprint",
      ));
    }
  }
  const operations = new Set();
  for (const [index, requirement] of (value?.required_operations ?? []).entries()) {
    if (operations.has(requirement.operation)) {
      errors.push(artifactError(
        `/required_operations/${index}/operation`,
        `duplicate required operation: ${requirement.operation}`,
        "requested-pass-operation",
      ));
    }
    operations.add(requirement.operation);
  }
  const requested = new Set();
  for (const [index, request] of (value?.requested_subchecks ?? []).entries()) {
    const key = `${request.operation}\0${request.subcheck}`;
    if (requested.has(key)) {
      errors.push(artifactError(
        `/requested_subchecks/${index}`,
        "a newly requested subcheck can appear only once",
        "requested-pass-subcheck",
      ));
    }
    requested.add(key);
  }
  const inapplicable = new Set();
  for (const [index, reason] of (value?.inapplicability ?? []).entries()) {
    for (const filePath of reason.paths) {
      const key = `${reason.operation}\0${reason.subcheck}\0${filePath}`;
      if (inapplicable.has(key)) {
        errors.push(artifactError(
          `/inapplicability/${index}`,
          `duplicate inapplicability record for ${reason.operation}/${reason.subcheck} at ${filePath}`,
          "requested-pass-applicability",
        ));
      }
      inapplicable.add(key);
      const requirement = passRequirements(value, reason.operation);
      if (requirement?.subchecks.includes(reason.subcheck) && requirement.paths.includes(filePath)) {
        errors.push(artifactError(
          `/inapplicability/${index}`,
          `${reason.operation}/${reason.subcheck} cannot be required and inapplicable at ${filePath}`,
          "requested-pass-applicability",
        ));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateNoEditSkip(value, options = {}) {
  const schema = validateNoEditSkipSchema(value, options);
  const errors = [...schema.errors];
  for (const operation of ["revision-plan", "chapter-revision"]) {
    if (!value?.operations?.includes(operation)) {
      errors.push(artifactError(
        "/operations",
        `a no-edit skip must record ${operation}`,
        "no-edit-operations",
      ));
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateReviewGroup(value, options = {}) {
  const schema = validateReviewGroupSchema(value, options);
  const errors = [...schema.errors];
  const perspectives = new Set((value?.jobs ?? []).map((entry) => entry.perspective));
  for (const perspective of PERSPECTIVES) {
    if (!perspectives.has(perspective)) {
      errors.push(artifactError(
        "/jobs",
        `review group requires its ${perspective} perspective`,
        "review-group-perspective",
      ));
    }
  }
  if (perspectives.size !== (value?.jobs ?? []).length) {
    errors.push(artifactError(
      "/jobs",
      "review group perspectives must be unique",
      "review-group-perspective",
    ));
  }
  return { valid: errors.length === 0, errors };
}

export function validateSemanticAttestation(value, options = {}) {
  const schema = validateSemanticAttestationSchema(value, options);
  const errors = [...schema.errors];
  const claims = new Set();
  for (const [index, claim] of (value?.claims ?? []).entries()) {
    if (claims.has(claim.claim_type)) {
      errors.push(artifactError(
        `/claims/${index}/claim_type`,
        "one attestation cannot repeat a claim type",
        "semantic-attestation-claim",
      ));
    }
    claims.add(claim.claim_type);
  }
  return { valid: errors.length === 0, errors };
}

export function validateConvergenceEvaluation(value, options = {}) {
  const schema = validateConvergenceEvaluationSchema(value, options);
  const errors = [...schema.errors];
  if (value?.outcome === "satisfied" && value?.blockers?.length > 0) {
    errors.push(artifactError(
      "/blockers",
      "a satisfied evaluation cannot retain blockers",
      "convergence-evaluation-outcome",
    ));
  }
  if (value?.outcome !== "satisfied" && value?.blockers?.length === 0) {
    errors.push(artifactError(
      "/blockers",
      "a non-satisfied evaluation requires concrete blockers",
      "convergence-evaluation-outcome",
    ));
  }
  return { valid: errors.length === 0, errors };
}


export function passRequirements(pass, operation) {
  return pass?.required_operations?.find((requirement) => requirement.operation === operation) ?? null;
}
