import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

import { canReuseCoverageUnit, validateCoverageIndex } from "./artifacts.mjs";
import { validateManifest } from "./manifest.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import {
  validateReaderStateForJob,
  validateReaderStateMarkdown,
  validateReviewJob,
} from "./review.mjs";
import {
  validateConvergenceCycleSchema,
  validateConvergenceEvaluationSchema,
  validateNoEditSkipSchema,
  validateReaderStateSchema,
  validateRelativePath,
  validateRequestedPassSchema,
  validateReviewGroupSchema,
  validateReviewJobSchema,
  validateSemanticAttestationSchema,
} from "./schemas.mjs";
import {
  validateFullManuscriptScope,
  validateInventorySnapshot,
  validateScopeSnapshot,
} from "./scope.mjs";
import {
  acquireDirectoryLock,
  createNoClobberVerified,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { appendCycleCompletionDecision, parseTrackerState } from "./tracker.mjs";

const COVERAGE_OPERATIONS = ["diagnostics", "characters", "prose", "ai-cleanup"];
const PERSPECTIVES = ["intent", "standards", "fresh"];
const DEFAULT_ACTION = Object.freeze({
  strategy: "revise-draft",
  operation: "intake",
  command: "revise-draft",
});

function artifactError(instancePath, message, keyword = "convergence-artifact") {
  return { instancePath, keyword, message, params: {} };
}

function sameReference(left, right) {
  return left?.path === right?.path && left?.sha256 === right?.sha256;
}

function samePassReference(left, right) {
  return sameReference(left, right) &&
    left?.pass_id === right?.pass_id &&
    left?.pass_fingerprint === right?.pass_fingerprint;
}

function sameScopeReference(left, right) {
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

export function validateRequestedPass(value) {
  const schema = validateRequestedPassSchema(value);
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

export function validateNoEditSkip(value) {
  const schema = validateNoEditSkipSchema(value);
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

export function validateReviewGroup(value) {
  const schema = validateReviewGroupSchema(value);
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

export function validateSemanticAttestation(value) {
  const schema = validateSemanticAttestationSchema(value);
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

export function validateConvergenceEvaluation(value) {
  const schema = validateConvergenceEvaluationSchema(value);
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

async function readProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Project validation failed: ${validation.errors.map((error) => error.message).join("; ")}`);
  }
  if (manifest.schema_version !== "3.2.0") {
    throw new Error("Convergence evaluation requires a v3.2 project");
  }
  return { root, manifestPath, manifest };
}

async function readActiveCycle(project) {
  const file = path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.json");
  let value;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const validation = validateConvergenceCycleSchema(value);
  if (!validation.valid || value.status !== "active") {
    throw new Error(`Living cycle is invalid: ${file}: ${formatErrors(validation.errors)}`);
  }
  return { value, file };
}

function operationTime(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Invalid convergence operation time");
  return now.toISOString();
}

function evaluationReference(evaluation, relativePath, text) {
  return {
    evaluation_id: evaluation.evaluation_id,
    path: relativePath,
    sha256: sha256Bytes(text),
  };
}

async function publishImmutable(file, text) {
  try {
    await createNoClobberVerified(file, text);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(file, "utf8");
    if (existing !== text) throw new Error(`Immutable artifact already differs: ${file}`);
  }
}

function formatErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

async function completedCycles(project) {
  const directory = path.resolve(project.root, project.manifest.paths.convergence, "cycles");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const cycles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
    const validation = validateConvergenceCycleSchema(value);
    if (!validation.valid) {
      throw new Error(`Completed cycle is invalid: ${entry.name}: ${formatErrors(validation.errors)}`);
    }
    if (value.status === "completed") cycles.push(value);
  }
  return cycles.sort((left, right) =>
    String(left.completion?.completed_at ?? left.updated_at).localeCompare(
      String(right.completion?.completed_at ?? right.updated_at),
    ) || left.cycle_id.localeCompare(right.cycle_id)
  );
}

async function readEvaluationReference(project, reference) {
  const text = await readFile(path.resolve(project.root, reference.path), "utf8");
  if (sha256Bytes(text) !== reference.sha256) {
    throw new Error(`Evaluation content hash changed: ${reference.path}`);
  }
  const value = JSON.parse(text);
  const validation = validateConvergenceEvaluation(value);
  if (!validation.valid) throw new Error(formatErrors(validation.errors));
  if (value.evaluation_id !== reference.evaluation_id) {
    throw new Error(`Evaluation identity changed: ${reference.path}`);
  }
  return { value, text };
}

async function latestSatisfiedPass(project, excludeCycleId = null) {
  const candidates = [];
  for (const cycle of await completedCycles(project)) {
    if (cycle.cycle_id === excludeCycleId || !cycle.target_evaluation || !cycle.requested_pass) {
      continue;
    }
    try {
      const { value: evaluation } = await readEvaluationReference(project, cycle.target_evaluation);
      if (evaluation.outcome !== "satisfied") continue;
      const passText = await readFile(path.resolve(project.root, cycle.requested_pass.path), "utf8");
      if (sha256Bytes(passText) !== cycle.requested_pass.sha256) continue;
      const pass = JSON.parse(passText);
      if (!validateRequestedPass(pass).valid || pass.narrowing !== null) continue;
      if (
        pass.pass_id !== cycle.requested_pass.pass_id ||
        pass.pass_fingerprint !== cycle.requested_pass.pass_fingerprint
      ) continue;
      candidates.push({ cycle, evaluation, pass, passReference: cycle.requested_pass });
    } catch {
      continue;
    }
  }
  return candidates.at(-1) ?? null;
}

function newComputation(project, cycle, roots, evaluationId, createdAt) {
  const artifacts = new Map();
  const blockers = [];
  const blockerKeys = new Set();
  const action = cycle?.recovery_position
    ? {
        strategy: cycle.recovery_position.required_strategy,
        operation: cycle.recovery_position.operation,
        command: cycle.recovery_position.required_strategy,
      }
    : DEFAULT_ACTION;

  function block(code, message, kind = "indeterminate", details = {}) {
    const key = `${code}\0${details.path ?? ""}\0${details.artifact_id ?? ""}\0${message}`;
    if (blockerKeys.has(key)) return;
    blockerKeys.add(key);
    blockers.push({
      code,
      message,
      ...(details.path ? { path: details.path } : {}),
      ...(details.artifact_id ? { artifact_id: details.artifact_id } : {}),
      required_action: details.required_action === undefined ? action : details.required_action,
      kind,
    });
  }

  function record(role, artifactId, reference) {
    if (!reference?.path || !reference?.sha256) {
      block("artifact-reference-missing", `Missing content reference for ${role} ${artifactId}.`);
      return null;
    }
    const key = `${role}\0${artifactId}\0${reference.path}`;
    const existing = artifacts.get(key);
    if (existing && existing.sha256 !== reference.sha256) {
      block(
        "artifact-identity-conflict",
        `Conflicting hashes were recorded for ${reference.path}.`,
        "indeterminate",
        { path: reference.path, artifact_id: artifactId },
      );
    }
    const artifact = {
      role,
      artifact_id: String(artifactId),
      path: reference.path,
      sha256: reference.sha256,
    };
    artifacts.set(key, artifact);
    return artifact;
  }

  async function bytes(reference, role, artifactId) {
    record(role, artifactId, reference);
    let contents;
    try {
      contents = await readFile(path.resolve(project.root, reference.path));
    } catch (error) {
      block(
        "artifact-unavailable",
        `Cannot read ${role} ${reference.path}: ${error.message}`,
        "indeterminate",
        { path: reference.path, artifact_id: artifactId },
      );
      return null;
    }
    if (sha256Bytes(contents) !== reference.sha256) {
      block(
        "artifact-hash-mismatch",
        `Content hash changed for ${role} ${reference.path}.`,
        "indeterminate",
        { path: reference.path, artifact_id: artifactId },
      );
    }
    return contents;
  }

  async function json(reference, role, artifactId, validate) {
    const contents = await bytes(reference, role, artifactId);
    if (!contents) return null;
    let value;
    try {
      value = JSON.parse(contents.toString("utf8"));
    } catch (error) {
      block(
        "artifact-json-invalid",
        `Cannot parse ${role} ${reference.path}: ${error.message}`,
        "indeterminate",
        { path: reference.path, artifact_id: artifactId },
      );
      return null;
    }
    if (validate) {
      const validation = validate(value);
      if (!validation.valid) {
        block(
          "artifact-contract-invalid",
          `${role} ${reference.path} is invalid: ${formatErrors(validation.errors)}`,
          "indeterminate",
          { path: reference.path, artifact_id: artifactId },
        );
        return null;
      }
    }
    return value;
  }

  return { project, cycle, roots, evaluationId, createdAt, artifacts, blockers, block, record, bytes, json };
}

function passRequirements(pass, operation) {
  return pass?.required_operations?.find((requirement) => requirement.operation === operation) ?? null;
}

function targetFiles(scope, paths = null) {
  const selected = paths ? new Set(paths) : null;
  return (scope?.files ?? []).filter((file) => !selected || selected.has(file.path));
}

function sameVersionedFiles(left, right, ordered = true) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  if (ordered) {
    return left.every((file, index) =>
      file.path === right[index]?.path && file.sha256 === right[index]?.sha256
    );
  }
  const keys = (files) => files.map((file) => `${file.path}\0${file.sha256}`).sort();
  const leftKeys = keys(left);
  const rightKeys = keys(right);
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

async function loadReport(computation, reference, { currentPass = true, inputFiles = null } = {}) {
  const { roots, block, record } = computation;
  const referenceId = reference.report_id;
  const contents = await computation.bytes(reference, "report", referenceId ?? reference.path);
  if (!contents) return null;
  const markdown = contents.toString("utf8");
  const validation = validateEvidenceReport(markdown);
  if (!validation.valid || !validation.envelope) {
    block(
      "report-contract-invalid",
      `Report ${reference.path} is invalid: ${formatErrors(validation.errors)}`,
      "indeterminate",
      { path: reference.path, artifact_id: referenceId },
    );
    return null;
  }
  const report = validation.envelope;
  if (referenceId && report.report_id !== referenceId) {
    block(
      "report-identity-mismatch",
      `Report identity does not match its reference: ${reference.path}`,
      "indeterminate",
      { path: reference.path, artifact_id: referenceId },
    );
  }
  if (!referenceId) {
    computation.artifacts.delete(`report\0${reference.path}\0${reference.path}`);
  }
  record("report", report.report_id, reference);
  if (currentPass) {
    if (
      report.scope_id !== roots.target_scope.scope_id ||
      report.scope_fingerprint !== roots.target_scope.scope_fingerprint ||
      !samePassReference(report.requested_pass, roots.requested_pass)
    ) {
      block(
        "report-scope-mismatch",
        `Report ${reference.path} is not bound to the evaluated pass and target fingerprint.`,
        "indeterminate",
        { path: reference.path, artifact_id: report.report_id },
      );
    }
  }
  if (report.language !== computation.pass?.language) {
    block(
      "report-language-mismatch",
      `Report ${reference.path} does not use the requested language.`,
      "not_satisfied",
      { path: reference.path, artifact_id: report.report_id },
    );
  }
  if (report.engine.degraded) {
    block(
      "degraded-required-coverage",
      `Report ${reference.path} records degraded required coverage.`,
      "not_satisfied",
      { path: reference.path, artifact_id: report.report_id },
    );
  }
  const operationCoverage = report.engine.notes.match(/(?:^|\s)operation_coverage=([^\s]+)/)?.[1];
  if (operationCoverage !== "full") {
    block(
      "degraded-required-coverage",
      `Report ${reference.path} records ${operationCoverage ?? "unknown"} operation coverage.`,
      "not_satisfied",
      { path: reference.path, artifact_id: report.report_id },
    );
  }
  if (inputFiles) {
    const inputs = new Map(report.inputs.map((input) => [input.path, input]));
    for (const file of inputFiles) {
      if (inputs.get(file.path)?.version !== file.sha256 || inputs.get(file.path)?.version_type !== "sha256") {
        block(
          "report-input-mismatch",
          `Report ${reference.path} does not bind current input ${file.path}@${file.sha256}.`,
          "indeterminate",
          { path: file.path, artifact_id: report.report_id },
        );
      }
    }
  }
  return { report, reference: { ...reference, report_id: report.report_id }, markdown };
}

async function computeEvaluation(project, cycle, roots, evaluationId, createdAt) {
  const computation = newComputation(project, cycle, roots, evaluationId, createdAt);
  const { block, record } = computation;
  const fullScope = await validateFullManuscriptScope(project.manifest, project.manifestPath);
  if (!fullScope.valid) {
    const code = project.manifest.current_scope?.files?.length === 0
      ? "empty-manuscript"
      : "target-scope-not-current";
    block(
      code,
      `The target is not a current nonempty full-manuscript scope: ${formatErrors(fullScope.errors)}`,
      code === "empty-manuscript" ? "not_satisfied" : "indeterminate",
    );
  }

  const scope = await computation.json(
    {
      path: roots.target_scope.snapshot_path,
      sha256: roots.target_scope.snapshot_sha256,
    },
    "scope-snapshot",
    roots.target_scope.scope_id,
    validateScopeSnapshot,
  );
  if (scope) {
    if (
      scope.scope_id !== roots.target_scope.scope_id ||
      scope.scope_fingerprint !== roots.target_scope.scope_fingerprint
    ) {
      block("scope-identity-mismatch", "Scope snapshot identity differs from the target reference.");
    }
    if (scope.inventory) {
      await computation.json(scope.inventory, "inventory-snapshot", scope.inventory.inventory_fingerprint, validateInventorySnapshot);
    }
    for (const file of scope.files) record("manuscript", file.path, file);
  }

  const pass = await computation.json(
    roots.requested_pass,
    "requested-pass",
    roots.requested_pass.pass_id,
    validateRequestedPass,
  );
  computation.pass = pass;
  if (pass) {
    if (
      pass.pass_id !== roots.requested_pass.pass_id ||
      pass.pass_fingerprint !== roots.requested_pass.pass_fingerprint ||
      !sameScopeReference(pass.target_scope, roots.target_scope)
    ) {
      block("requested-pass-identity-mismatch", "Requested-pass identity or target differs from its reference.");
    }
    if (JSON.stringify(pass.paths) !== JSON.stringify(scope?.files?.map((file) => file.path) ?? [])) {
      block(
        "requested-pass-paths-mismatch",
        "Requested-pass paths must equal the complete target reading order.",
        "not_satisfied",
      );
    }
    if (pass.language !== project.manifest.language) {
      block("requested-pass-language-mismatch", "Requested-pass language differs from project language.", "not_satisfied");
    }
    if (pass.narrowing) {
      block(
        "narrowed-requested-pass",
        `A narrowed requested pass cannot establish unrestricted current-draft revision convergence: ${pass.narrowing.gaps.join("; ")}`,
        "not_satisfied",
      );
    }
    for (const dependency of pass.dependencies) {
      await computation.bytes(dependency, "dependency", dependency.path);
    }
    const baseline = await latestSatisfiedPass(project, roots.cycle_id);
    if (baseline && !pass.baseline_pass) {
      block(
        "requested-pass-baseline-missing",
        `Requested pass must inherit the last satisfied full-manuscript pass ${baseline.pass.pass_id}.`,
      );
    } else if (!baseline && pass.baseline_pass) {
      block("requested-pass-baseline-mismatch", "No eligible satisfied baseline exists for the recorded baseline pass.");
    } else if (baseline && !samePassReference(pass.baseline_pass, baseline.passReference)) {
      block(
        "requested-pass-baseline-mismatch",
        `Baseline must name the latest satisfied full-manuscript pass ${baseline.pass.pass_id}.`,
      );
    }
    if (pass.baseline_pass) {
      const baselinePass = await computation.json(
        pass.baseline_pass,
        "baseline-pass",
        pass.baseline_pass.pass_id,
        validateRequestedPass,
      );
      if (baselinePass) {
        for (const source of baselinePass.required_operations) {
          const required = passRequirements(pass, source.operation);
          const missing = source.subchecks.filter((subcheck) => !required?.subchecks.includes(subcheck));
          if (missing.length > 0) {
            block(
              "requested-pass-baseline-reduced",
              `Requested pass removed inherited ${source.operation} subchecks: ${missing.join(", ")}.`,
              "not_satisfied",
            );
          }
        }
        const expected = deriveRequestedPassBaseline(baselinePass, pass.requested_subchecks);
        for (const requirement of expected) {
          const actual = passRequirements(pass, requirement.operation);
          if (
            !actual ||
            JSON.stringify([...actual.subchecks].sort()) !== JSON.stringify(requirement.subchecks)
          ) {
            block(
              "requested-pass-unrecorded-change",
              `${requirement.operation} subchecks must equal the inherited baseline plus explicitly requested additions.`,
            );
          }
        }
        for (const request of pass.requested_subchecks) {
          const inherited = passRequirements(baselinePass, request.operation);
          if (inherited?.subchecks.includes(request.subcheck)) {
            block(
              "requested-subcheck-not-extension",
              `${request.operation}/${request.subcheck} was already in the satisfied baseline and is not a new check.`,
              "not_satisfied",
            );
          }
        }
      }
      if (baseline) {
        record("baseline-evaluation", baseline.evaluation.evaluation_id, baseline.cycle.target_evaluation);
      }
    }
  }

  const trackerReference = {
    path: project.manifest.paths.audit_tracker,
    sha256: "",
  };
  try {
    trackerReference.sha256 = sha256Bytes(await readFile(path.resolve(project.root, trackerReference.path)));
  } catch {
    trackerReference.sha256 = "0".repeat(64);
  }
  const trackerText = await computation.bytes(trackerReference, "tracker", "audit-tracker");
  let tracker = { findings: [], approvals: [], completion_decisions: [], valid: false, errors: [] };
  if (trackerText) {
    tracker = await parseTrackerState(trackerText.toString("utf8"), project.root);
    if (!tracker.valid) {
      block("tracker-invalid", `Tracker is invalid: ${formatErrors(tracker.errors)}`);
    }
  }
  const openFindings = tracker.findings.filter((finding) => finding.status === "open");
  if (openFindings.length > 0) {
    block(
      "open-findings",
      `Current findings remain open: ${openFindings.map((finding) => finding.id).join(", ")}.`,
      "not_satisfied",
    );
  }

  const reports = new Map();
  for (const reference of roots.reports) {
    const loaded = await loadReport(computation, reference, {
      currentPass: true,
      inputFiles: targetFiles(scope),
    });
    if (loaded) reports.set(reference.path, loaded);
  }
  for (const operation of ["intake", "draft-baseline"]) {
    if (!passRequirements(pass, operation)) {
      block("required-operation-missing", `Requested pass does not require ${operation}.`, "not_satisfied");
      continue;
    }
    const matching = [...reports.values()].filter(({ report }) => report.stage === operation);
    if (matching.length !== 1) {
      block(
        "required-report-missing",
        `Expected exactly one current ${operation} report; found ${matching.length}.`,
      );
    }
  }

  const coverageIndex = await computation.json(
    roots.coverage_index,
    "coverage-index",
    roots.coverage_index.path,
    validateCoverageIndex,
  );
  const coverageClaimPaths = new Set([roots.coverage_index.path]);
  if (coverageIndex && pass && scope) {
    if (
      coverageIndex.scope_id !== roots.target_scope.scope_id ||
      coverageIndex.scope_fingerprint !== roots.target_scope.scope_fingerprint ||
      !samePassReference(coverageIndex.requested_pass, roots.requested_pass)
    ) {
      block("coverage-index-scope-mismatch", "Coverage index is not bound to the evaluated pass and target fingerprint.");
    }
    for (const operation of COVERAGE_OPERATIONS) {
      const requirement = passRequirements(pass, operation);
      if (!requirement) {
        block("required-operation-missing", `Requested pass does not require ${operation}.`, "not_satisfied");
        continue;
      }
      const requiredFiles = targetFiles(scope, requirement.paths);
      if (!sameVersionedFiles(requiredFiles, targetFiles(scope))) {
        block(
          "required-coverage-narrowed",
          `${operation} must cover every target-scope path for full-manuscript convergence.`,
          "not_satisfied",
        );
      }
      const entry = coverageIndex.entries.filter((candidate) => candidate.operation === operation);
      if (entry.length !== 1) {
        block("coverage-operation-missing", `Coverage index requires one ${operation} entry; found ${entry.length}.`);
        continue;
      }
      const coverageEntry = entry[0];
      if (coverageEntry.synthesis_coverage !== "full") {
        block(
          "degraded-required-coverage",
          `${operation} synthesis coverage is ${coverageEntry.synthesis_coverage ?? "missing"}.`,
          "not_satisfied",
        );
      }
      if (!coverageEntry.synthesis_report || !coverageEntry.synthesis_report_sha256) {
        block("coverage-synthesis-missing", `${operation} requires a hashed full-target synthesis report.`);
      } else {
        const synthesisReference = {
          path: coverageEntry.synthesis_report,
          sha256: coverageEntry.synthesis_report_sha256,
        };
        const synthesis = await loadReport(computation, synthesisReference, {
          currentPass: true,
          inputFiles: requiredFiles,
        });
        if (synthesis?.report.stage !== operation) {
          block("coverage-synthesis-mismatch", `${operation} synthesis report has the wrong report stage.`);
        }
        if (synthesis) reports.set(synthesisReference.path, synthesis);
        coverageClaimPaths.add(synthesisReference.path);
      }

      const covered = new Set();
      for (const unitReference of coverageEntry.units) {
        if (!unitReference.sha256) {
          block("coverage-unit-hash-missing", `Coverage unit ${unitReference.unit_id} has no content hash.`);
          continue;
        }
        const unit = await computation.json(unitReference, "coverage-unit", unitReference.unit_id);
        coverageClaimPaths.add(unitReference.path);
        if (!unit) continue;
        if (!unit.source_report_sha256) {
          block("coverage-source-hash-missing", `Coverage unit ${unit.unit_id} has no source report hash.`);
          continue;
        }
        const reuse = canReuseCoverageUnit(unit, {
          source_report: unit.source_report,
          operation,
          paths: unit.paths,
          subchecks: requirement.subchecks,
          dependencies: pass.dependencies,
        });
        const requiredByPath = new Map(requiredFiles.map((file) => [file.path, file.sha256]));
        const pathsMatch = unit.paths.every((file, index) =>
          requiredByPath.get(file.path) === file.sha256 &&
          requirement.paths.indexOf(file.path) >= 0 &&
          (index === 0 || requirement.paths.indexOf(unit.paths[index - 1].path) < requirement.paths.indexOf(file.path))
        );
        if (!reuse || !pathsMatch) {
          block(
            "coverage-unit-not-current",
            `Coverage unit ${unit.unit_id} does not match requested paths, subchecks, dependencies, or full local coverage.`,
            unit.coverage === "full" ? "indeterminate" : "not_satisfied",
          );
          continue;
        }
        for (const file of unit.paths) covered.add(file.path);
        const sourceReference = {
          path: unit.source_report,
          sha256: unit.source_report_sha256,
        };
        const source = await loadReport(computation, sourceReference, {
          currentPass: false,
          inputFiles: unit.paths,
        });
        if (source) {
          if (source.report.stage !== operation) {
            block("coverage-source-mismatch", `Coverage source report ${unit.source_report} has the wrong stage.`);
          }
          if (
            !source.report.requested_pass ||
            source.report.requested_pass.pass_id === roots.requested_pass.pass_id
          ) {
            if (
              source.report.scope_id !== roots.target_scope.scope_id ||
              source.report.scope_fingerprint !== roots.target_scope.scope_fingerprint ||
              !samePassReference(source.report.requested_pass, roots.requested_pass)
            ) {
              block("coverage-source-scope-mismatch", `Coverage source report ${unit.source_report} has inconsistent scope or pass binding.`);
            }
          }
          reports.set(sourceReference.path, source);
        }
        coverageClaimPaths.add(unit.source_report);
      }
      const missing = requirement.paths.filter((filePath) => !covered.has(filePath));
      if (missing.length > 0) {
        block(
          "required-coverage-missing",
          `${operation} lacks current full local coverage for: ${missing.join(", ")}.`,
          "not_satisfied",
        );
      }
    }
  }

  const currentFindingIds = new Set();
  for (const finding of tracker.findings) {
    if (finding.status === "stale" || finding.status === "open") continue;
    currentFindingIds.add(finding.id);
    if (!reports.has(finding.report)) {
      block(
        "finding-report-not-in-evidence",
        `Finding ${finding.id} names ${finding.report}, which is not in the evaluation evidence graph.`,
        "indeterminate",
        { path: finding.report, artifact_id: finding.id },
      );
    }
    if (finding.status === "resolved") {
      block(
        "verified-execution-required",
        `Resolved finding ${finding.id} requires verified revision execution evidence rather than a no-edit skip.`,
        "not_satisfied",
        { artifact_id: finding.id },
      );
    }
  }

  const skips = [];
  for (const reference of cycle.related_artifacts?.no_edit_skips ?? []) {
    const skip = await computation.json(reference, "no-edit-skip", reference.skip_id, validateNoEditSkip);
    if (!skip) continue;
    skips.push(skip);
    if (
      skip.skip_id !== reference.skip_id ||
      !samePassReference(skip.requested_pass, roots.requested_pass) ||
      skip.scope_fingerprint !== roots.target_scope.scope_fingerprint
    ) {
      block("no-edit-identity-mismatch", `No-edit skip ${reference.skip_id} is not bound to the evaluated pass and target.`);
    }
  }
  for (const operation of ["revision-plan", "chapter-revision"]) {
    if (!passRequirements(pass, operation)) {
      block("required-operation-missing", `Requested pass does not require ${operation}.`, "not_satisfied");
    }
    if (!skips.some((skip) => skip.operations.includes(operation))) {
      block("no-edit-evidence-missing", `No current no-edit skip covers ${operation}.`);
    }
  }
  const coveredFindings = new Set(skips.flatMap((skip) => skip.covered_findings));
  for (const findingId of currentFindingIds) {
    if (!coveredFindings.has(findingId)) {
      block(
        "no-edit-finding-decision-missing",
        `No-edit skips do not cover current finding ${findingId}.`,
        "indeterminate",
        { artifact_id: findingId },
      );
    }
  }
  for (const skip of skips) {
    const decision = tracker.approvals.find((approval) => approval.id === skip.author_decision_id);
    if (
      !decision ||
      decision.status !== "approved" ||
      decision.scopeId !== roots.target_scope.scope_id ||
      !skip.operations.includes(decision.operation) ||
      !(pass?.paths ?? []).every((filePath) => decision.paths.includes(filePath))
    ) {
      block(
        "no-edit-author-decision-missing",
        `No-edit skip ${skip.skip_id} lacks its current explicit author decision ${skip.author_decision_id}.`,
        "indeterminate",
        { artifact_id: skip.author_decision_id },
      );
    }
  }
  for (const request of pass?.requested_subchecks ?? []) {
    const decision = tracker.approvals.find((approval) => approval.id === request.author_decision_id);
    if (
      !decision ||
      decision.status !== "approved" ||
      decision.operation !== request.operation ||
      decision.scopeId !== roots.target_scope.scope_id
    ) {
      block(
        "requested-subcheck-author-decision-missing",
        `Newly requested ${request.operation}/${request.subcheck} lacks author decision ${request.author_decision_id}.`,
      );
    }
  }

  const reviewClaimPaths = new Set();
  const reviewGroup = await computation.json(
    roots.review_group,
    "review-group",
    roots.review_group.review_group_id,
    validateReviewGroup,
  );
  let freshReview = null;
  if (reviewGroup) {
    reviewClaimPaths.add(roots.review_group.path);
    if (
      !(cycle.related_artifacts?.review_groups ?? []).some((reference) =>
        reference.review_group_id === roots.review_group.review_group_id && sameReference(reference, roots.review_group)
      )
    ) {
      block("review-group-not-linked", "The evaluated review group is not linked to the active cycle.");
    }
    if (
      reviewGroup.review_group_id !== roots.review_group.review_group_id ||
      !samePassReference(reviewGroup.requested_pass, roots.requested_pass) ||
      reviewGroup.scope_fingerprint !== roots.target_scope.scope_fingerprint
    ) {
      block("review-group-identity-mismatch", "Review group is not bound to the evaluated pass and target fingerprint.");
    }
    const expectedReportPaths = new Set();
    for (const jobInput of reviewGroup.jobs) {
      const job = await computation.json(jobInput.job, "review-job", jobInput.job.job_id, validateReviewJobSchema);
      reviewClaimPaths.add(jobInput.job.path);
      if (!job) continue;
      const jobValidation = validateReviewJob(job);
      if (!jobValidation.valid) {
        block(
          "review-job-invalid",
          `Review job ${jobInput.job.job_id} is invalid: ${formatErrors(jobValidation.errors)}`,
          job.status === "complete" && job.coverage === "full" ? "indeterminate" : "not_satisfied",
        );
      }
      if (
        job.job_id !== jobInput.job.job_id ||
        job.perspective !== jobInput.perspective ||
        job.scope_id !== roots.target_scope.scope_id ||
        !sameVersionedFiles(job.files, targetFiles(scope))
      ) {
        block("review-job-scope-mismatch", `Review job ${jobInput.job.job_id} does not match its perspective or complete target scope.`);
      }
      if (job.status !== "complete" || job.coverage !== "full") {
        block(
          "incomplete-review-chain",
          `Review job ${job.job_id} is ${job.status} with ${job.coverage} coverage.`,
          "not_satisfied",
        );
      }
      for (const file of job.files) {
        try {
          const text = await readFile(path.resolve(project.root, file.path), "utf8");
          if (text.split(/\r?\n/).length !== file.line_count) {
            block(
              "review-source-range-mismatch",
              `Review job ${job.job_id} declares an inaccurate line count for ${file.path}.`,
              "indeterminate",
              { path: file.path, artifact_id: job.job_id },
            );
          }
        } catch {
          // Scope validation already reports the unavailable manuscript.
        }
      }
      if (job.reviewer_state_path !== jobInput.reader_state.path) {
        block("reader-state-identity-mismatch", `Review job ${job.job_id} does not name the grouped reader state.`);
      }
      let state = null;
      if (/\.(?:md|markdown)$/i.test(jobInput.reader_state.path)) {
        const contents = await computation.bytes(jobInput.reader_state, "reader-state", jobInput.reader_state.state_id);
        if (contents) {
          const parsed = validateReaderStateMarkdown(contents.toString("utf8"));
          if (!parsed.valid || !parsed.envelope) {
            block("reader-state-invalid", `Reader state ${jobInput.reader_state.path} is invalid: ${formatErrors(parsed.errors)}`);
          } else {
            state = parsed.envelope;
          }
        }
      } else {
        state = await computation.json(
          jobInput.reader_state,
          "reader-state",
          jobInput.reader_state.state_id,
          validateReaderStateSchema,
        );
      }
      reviewClaimPaths.add(jobInput.reader_state.path);
      if (state) {
        if (state.state_id !== jobInput.reader_state.state_id) {
          block("reader-state-identity-mismatch", `Reader state identity differs from ${jobInput.reader_state.path}.`);
        }
        const stateValidation = validateReaderStateForJob(state, job);
        if (!stateValidation.valid) {
          block("reader-state-chain-invalid", `Reader state ${state.state_id} does not match its job: ${formatErrors(stateValidation.errors)}`);
        }
        if (state.status !== "complete") {
          block("incomplete-review-chain", `Reader state ${state.state_id} is not complete.`, "not_satisfied");
        }
        if (job.status === "complete" && state.status === "complete") {
          const expected = job.chunks.map((chunk) => `${chunk.chunk_id}\0${chunk.sequence}`);
          const actual = state.chunks.map((chunk) => `${chunk.chunk_id}\0${chunk.sequence}`);
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            block(
              "incomplete-review-chain",
              `Reader state ${state.state_id} does not contain every completed job chunk in order.`,
              "not_satisfied",
            );
          }
        }
      }
      for (const chunk of job.chunks) if (chunk.report) expectedReportPaths.add(chunk.report);
      for (const volume of job.volumes) if (volume.report) expectedReportPaths.add(volume.report);
      if (job.book.report) expectedReportPaths.add(job.book.report);
      if (jobInput.perspective === "fresh") {
        freshReview = { job, jobReference: jobInput.job, state, stateReference: jobInput.reader_state };
      }
    }
    const groupedPaths = new Set(reviewGroup.reports.map((reference) => reference.path));
    if (
      groupedPaths.size !== expectedReportPaths.size ||
      ![...expectedReportPaths].every((reportPath) => groupedPaths.has(reportPath))
    ) {
      block("review-report-set-mismatch", "Review group reports do not exactly cover every job chunk, volume, and book synthesis.");
    }
    for (const reference of reviewGroup.reports) {
      const loaded = await loadReport(computation, reference, { currentPass: true });
      if (loaded && !["current-scope-review", "final-review"].includes(loaded.report.stage)) {
        block("review-report-stage-mismatch", `Review report ${reference.path} has the wrong stage.`);
      }
      if (loaded) reports.set(reference.path, loaded);
      reviewClaimPaths.add(reference.path);
    }
  }

  const attestationRecords = [];
  for (const reference of roots.semantic_attestations) {
    const attestation = await computation.json(
      reference,
      "semantic-attestation",
      reference.attestation_id,
      validateSemanticAttestation,
    );
    if (!attestation) continue;
    attestationRecords.push({ attestation, reference });
    if (
      attestation.attestation_id !== reference.attestation_id ||
      attestation.pass_id !== roots.requested_pass.pass_id ||
      attestation.pass_fingerprint !== roots.requested_pass.pass_fingerprint ||
      attestation.scope_id !== roots.target_scope.scope_id ||
      attestation.scope_fingerprint !== roots.target_scope.scope_fingerprint
    ) {
      block("semantic-attestation-identity-mismatch", `Semantic attestation ${reference.attestation_id} is not bound to this pass and target.`);
    }
    for (const claim of attestation.claims) {
      for (const artifact of claim.artifacts) {
        const current = await computation.bytes(artifact, "attested-artifact", artifact.path);
        if (current && ![...computation.artifacts.values()].some((entry) =>
          entry.path === artifact.path && entry.sha256 === artifact.sha256 && entry.role !== "attested-artifact"
        )) {
          block(
            "semantic-attestation-evidence-orphan",
            `Attestation ${attestation.attestation_id} references ${artifact.path} outside the deterministic evidence roles.`,
          );
        }
      }
    }
  }

  function requireClaim(claimType, role, requiredPaths, subject = null) {
    const matching = attestationRecords.flatMap(({ attestation }) =>
      attestation.claims
        .filter((claim) =>
          claim.claim_type === claimType &&
          attestation.attester.role === role &&
          (!subject || claim.subject === subject)
        )
        .map((claim) => ({ claim, attestation }))
    );
    if (matching.length !== 1) {
      block(
        "semantic-attestation-missing",
        `Expected one ${claimType} claim from ${role}; found ${matching.length}.`,
      );
      return;
    }
    const [{ claim, attestation }] = matching;
    if (claim.verdict !== "confirmed") {
      block(
        "semantic-claim-refuted",
        `Semantic attestation ${attestation.attestation_id} refutes ${claimType}: ${claim.statement}`,
        "not_satisfied",
      );
    }
    const claimedPaths = new Set(claim.artifacts.map((artifact) => artifact.path));
    const missing = [...requiredPaths].filter((artifactPath) => !claimedPaths.has(artifactPath));
    if (missing.length > 0) {
      block(
        "semantic-attestation-coverage-missing",
        `${claimType} does not attest all required evidence: ${missing.join(", ")}.`,
      );
    }
  }

  requireClaim("coverage-semantics", "host", coverageClaimPaths);
  requireClaim("review-semantics", "host", reviewClaimPaths);
  if (reviewGroup) {
    const freshReference = reviewGroup.fresh_reader_attestation;
    if (!roots.semantic_attestations.some((reference) =>
      reference.attestation_id === freshReference.attestation_id && sameReference(reference, freshReference)
    )) {
      block("semantic-attestation-missing", "The grouped fresh logical-reviewer attestation is not an evaluation input.");
    }
    requireClaim(
      "fresh-reader-continuity",
      "logical-reviewer",
      new Set(freshReview ? [freshReview.jobReference.path, freshReview.stateReference.path] : []),
      freshReview?.job.job_id ?? null,
    );
  }

  for (const artifact of computation.artifacts.values()) {
    if (["manuscript", "dependency", "attested-artifact"].includes(artifact.role)) continue;
    try {
      const contents = await readFile(path.resolve(project.root, artifact.path));
      if (sha256Bytes(contents) !== artifact.sha256) {
        block(
          "artifact-hash-mismatch",
          `Content hash changed for ${artifact.role} ${artifact.path}.`,
          "indeterminate",
          { path: artifact.path, artifact_id: artifact.artifact_id },
        );
      }
    } catch (error) {
      block(
        "artifact-unavailable",
        `Cannot reread ${artifact.role} ${artifact.path}: ${error.message}`,
        "indeterminate",
        { path: artifact.path, artifact_id: artifact.artifact_id },
      );
    }
  }

  const outcome = computation.blockers.some((blocker) => blocker.kind === "not_satisfied")
    ? "not_satisfied"
    : computation.blockers.length > 0
      ? "indeterminate"
      : "satisfied";
  const evaluation = {
    schema_version: "1.0.0",
    evaluation_id: evaluationId,
    cycle_id: roots.cycle_id,
    requested_pass: roots.requested_pass,
    target_scope: roots.target_scope,
    coverage_index: roots.coverage_index,
    reports: roots.reports,
    review_group: roots.review_group,
    semantic_attestations: roots.semantic_attestations,
    outcome,
    blockers: computation.blockers.map(({ kind, ...blocker }) => blocker),
    evidence_graph: {
      artifacts: [...computation.artifacts.values()].sort((left, right) =>
        left.role.localeCompare(right.role) ||
        left.path.localeCompare(right.path) ||
        left.artifact_id.localeCompare(right.artifact_id)
      ),
    },
    created_at: createdAt,
  };
  const validation = validateConvergenceEvaluation(evaluation);
  if (!validation.valid) throw new Error(`Generated evaluation is invalid: ${formatErrors(validation.errors)}`);
  return evaluation;
}

function sameEvidenceGraph(left, right) {
  return JSON.stringify(left?.artifacts ?? []) === JSON.stringify(right?.artifacts ?? []);
}

async function recomputeStoredEvaluation(project, cycle, reference) {
  const { value: stored } = await readEvaluationReference(project, reference);
  const recomputed = await computeEvaluation(
    project,
    cycle,
    {
      cycle_id: stored.cycle_id,
      requested_pass: stored.requested_pass,
      target_scope: stored.target_scope,
      coverage_index: stored.coverage_index,
      reports: stored.reports,
      review_group: stored.review_group,
      semantic_attestations: stored.semantic_attestations,
    },
    stored.evaluation_id,
    stored.created_at,
  );
  return {
    stored,
    recomputed,
    current: stored.outcome === recomputed.outcome &&
      sameEvidenceGraph(stored.evidence_graph, recomputed.evidence_graph),
  };
}


function publicFailure(code, message, cycle = null, details = {}) {
  return {
    valid: false,
    cycle,
    evaluation: null,
    state_written: false,
    blockers: [{ code, message, required_action: cycle?.recovery_position ? {
      strategy: cycle.recovery_position.required_strategy,
      operation: cycle.recovery_position.operation,
      command: cycle.recovery_position.required_strategy,
    } : DEFAULT_ACTION }],
    ...details,
  };
}

function validateEvaluationRequest(request) {
  const allowed = new Set([
    "cycle_id",
    "expected_revision",
    "evaluation_id",
    "coverage_index",
    "reports",
    "review_group",
    "semantic_attestations",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown evaluate-cycle input field: ${key}`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id ?? "") ||
    !Number.isInteger(request.expected_revision) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.evaluation_id ?? "") ||
    !request.coverage_index ||
    !Array.isArray(request.reports) ||
    !request.review_group ||
    !Array.isArray(request.semantic_attestations)
  ) {
    throw new Error("evaluate-cycle requires cycle, revision, evaluation, and evidence root identities");
  }
  const references = [
    [request.coverage_index, ["path", "sha256"], null],
    ...request.reports.map((reference) => [reference, ["report_id", "path", "sha256"], "report_id"]),
    [request.review_group, ["review_group_id", "path", "sha256"], "review_group_id"],
    ...request.semantic_attestations.map((reference) => [
      reference,
      ["attestation_id", "path", "sha256"],
      "attestation_id",
    ]),
  ];
  for (const [reference, fields, idField] of references) {
    if (
      !reference ||
      Object.keys(reference).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(reference, field)) ||
      !validateRelativePath(reference.path).valid ||
      !/^[0-9a-f]{64}$/.test(reference.sha256) ||
      (idField && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reference[idField]))
    ) {
      throw new Error("evaluate-cycle evidence roots require closed identities, safe paths, and SHA-256 hashes");
    }
  }
}

async function lockProjectCycle(project, options, operation) {
  const lock = await acquireDirectoryLock(
    path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
    },
  );
  if (!lock.acquired) {
    return {
      lockFailure: publicFailure(
        lock.code === "timeout" ? "cycle-transition-lock-timeout" : "cycle-transition-lock-error",
        `Cannot coordinate convergence state at ${lock.directory}: ${lock.error.message}`,
        null,
        { lock_path: lock.directory },
      ),
    };
  }
  let value;
  let operationError;
  try {
    value = await operation();
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      lockFailure: publicFailure(
        "cycle-transition-lock-release-error",
        `Cannot release convergence lock ${lock.directory}: ${released.error.message}.${operationError ? ` Operation also failed: ${operationError.message}` : ""}`,
        value?.cycle ?? null,
        { state_written: value?.state_written ?? null, lock_path: lock.directory },
      ),
    };
  }
  if (operationError) throw operationError;
  return { value };
}

export async function evaluateCycle(projectRoot, request, options = {}) {
  validateEvaluationRequest(request);
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project);
  if (!initial) return publicFailure("active-cycle-required", "An active cycle is required for evaluation.");
  const locked = await lockProjectCycle(project, options, async () => {
    const active = await readActiveCycle(project);
    if (!active) return publicFailure("active-cycle-required", "An active cycle is required for evaluation.");
    const cycle = active.value;
    if (cycle.cycle_id !== request.cycle_id) {
      return publicFailure("cycle-id-mismatch", `The requested cycle does not match active cycle ${cycle.cycle_id}.`, cycle);
    }
    if (cycle.revision !== request.expected_revision) {
      return publicFailure(
        "cycle-revision-conflict",
        `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
        cycle,
      );
    }
    if (!cycle.target_scope || !cycle.requested_pass) {
      return publicFailure("evaluation-input-unavailable", "The active cycle requires target scope and requested-pass references before evaluation.", cycle);
    }
    const roots = {
      cycle_id: cycle.cycle_id,
      requested_pass: cycle.requested_pass,
      target_scope: cycle.target_scope,
      coverage_index: request.coverage_index,
      reports: request.reports,
      review_group: request.review_group,
      semantic_attestations: request.semantic_attestations,
    };
    const evaluation = await computeEvaluation(
      project,
      cycle,
      roots,
      request.evaluation_id,
      operationTime(options),
    );
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      `${evaluation.evaluation_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const text = `${JSON.stringify(evaluation, null, 2)}\n`;
    await publishImmutable(absolute, text);
    const reference = evaluationReference(evaluation, relative, text);
    const updated = {
      ...cycle,
      revision: cycle.revision + 1,
      target_evaluation: reference,
      recovery_position: evaluation.outcome === "satisfied"
        ? {
            operation: null,
            reason: "The current satisfied target evaluation awaits an explicit author completion decision.",
            required_strategy: cycle.current_strategy,
          }
        : cycle.recovery_position,
      updated_at: operationTime(options),
    };
    await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
    return {
      valid: evaluation.outcome === "satisfied",
      cycle: updated,
      evaluation,
      evaluation_path: absolute,
      evaluation_reference: reference,
      state_written: true,
      blockers: evaluation.blockers,
    };
  });
  return locked.lockFailure ?? locked.value;
}

function validateCompletionRequest(request) {
  const allowed = new Set([
    "cycle_id",
    "expected_revision",
    "evaluation_id",
    "decision_id",
    "author_confirmed",
  ]);
  for (const key of Object.keys(request)) {
    if (!allowed.has(key)) throw new Error(`Unknown complete-cycle input field: ${key}`);
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.cycle_id ?? "") ||
    !Number.isInteger(request.expected_revision) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.evaluation_id ?? "") ||
    !/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(request.decision_id ?? "") ||
    request.author_confirmed !== true
  ) {
    throw new Error("complete-cycle requires exact cycle, revision, new evaluation, decision ID, and explicit author confirmation");
  }
}

export async function completeCycle(projectRoot, request, options = {}) {
  validateCompletionRequest(request);
  const project = await readProject(projectRoot);
  const initial = await readActiveCycle(project);
  if (!initial) return publicFailure("active-cycle-required", "An active cycle is required for completion.");
  const locked = await lockProjectCycle(project, options, async () => {
    const active = await readActiveCycle(project);
    if (!active) return publicFailure("active-cycle-required", "An active cycle is required for completion.");
    const cycle = active.value;
    if (cycle.cycle_id !== request.cycle_id) {
      return publicFailure("cycle-id-mismatch", `The requested cycle does not match active cycle ${cycle.cycle_id}.`, cycle);
    }
    if (cycle.revision !== request.expected_revision) {
      return publicFailure(
        "cycle-revision-conflict",
        `Expected cycle revision ${request.expected_revision}, but the active revision is ${cycle.revision}.`,
        cycle,
      );
    }
    if (!cycle.target_evaluation || !cycle.target_scope) {
      return publicFailure("completion-evaluation-not-satisfied", "A current satisfied target evaluation is required before completion.", cycle);
    }
    let current;
    try {
      current = await recomputeStoredEvaluation(project, cycle, cycle.target_evaluation);
    } catch (error) {
      return publicFailure("completion-evaluation-not-satisfied", `Target evaluation cannot be trusted: ${error.message}`, cycle);
    }
    const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
    const trackerBefore = await readFile(trackerPath, "utf8");
    const trackerState = await parseTrackerState(trackerBefore, project.root);
    const existingDecision = trackerState.completion_decisions.find(
      (decision) => decision.id === request.decision_id,
    );
    if (existingDecision && (
      existingDecision.cycleId !== cycle.cycle_id ||
      existingDecision.scopeFingerprint !== cycle.target_scope.scope_fingerprint ||
      existingDecision.status !== "approved"
    )) {
      return publicFailure("completion-decision-mismatch", `Completion decision ${request.decision_id} names different state.`, cycle);
    }
    if (!existingDecision && (!current.current || current.recomputed.outcome !== "satisfied")) {
      return {
        ...publicFailure(
          "completion-evaluation-not-satisfied",
          "Author confirmation cannot override a stale, not_satisfied, or indeterminate target evaluation.",
          cycle,
        ),
        evaluation: current.recomputed,
      };
    }

    const completedAt = operationTime(options);
    if (!existingDecision) {
      const trackerAfter = appendCycleCompletionDecision(trackerBefore, {
        decision_id: request.decision_id,
        cycle_id: cycle.cycle_id,
        scope_fingerprint: cycle.target_scope.scope_fingerprint,
        reason: `Author confirmed completion after satisfied evaluation ${cycle.target_evaluation.evaluation_id}.`,
        updated_at: completedAt,
      });
      await writeAtomicVerified(trackerPath, trackerAfter);
    }
    const previous = current.stored;
    const evaluation = await computeEvaluation(
      project,
      cycle,
      {
        cycle_id: cycle.cycle_id,
        requested_pass: previous.requested_pass,
        target_scope: previous.target_scope,
        coverage_index: previous.coverage_index,
        reports: previous.reports,
        review_group: previous.review_group,
        semantic_attestations: previous.semantic_attestations,
      },
      request.evaluation_id,
      completedAt,
    );
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      `${evaluation.evaluation_id}.json`,
    );
    const absolute = path.resolve(project.root, relative);
    const text = `${JSON.stringify(evaluation, null, 2)}\n`;
    await publishImmutable(absolute, text);
    const reference = evaluationReference(evaluation, relative, text);
    if (evaluation.outcome !== "satisfied") {
      const updated = {
        ...cycle,
        revision: cycle.revision + 1,
        target_evaluation: reference,
        updated_at: completedAt,
      };
      await writeAtomicVerified(active.file, `${JSON.stringify(updated, null, 2)}\n`);
      return {
        valid: false,
        cycle: updated,
        evaluation,
        evaluation_path: absolute,
        evaluation_reference: reference,
        state_written: true,
        blockers: evaluation.blockers,
      };
    }

    const completed = {
      ...cycle,
      revision: cycle.revision + 1,
      status: "completed",
      target_evaluation: reference,
      recovery_position: null,
      completion: {
        decision_id: request.decision_id,
        target_evaluation_id: evaluation.evaluation_id,
        completed_at: completedAt,
      },
      updated_at: completedAt,
    };
    const completedValidation = validateConvergenceCycleSchema(completed);
    if (
      !completedValidation.valid ||
      completed.completion.target_evaluation_id !== completed.target_evaluation.evaluation_id
    ) {
      throw new Error(`Generated completed cycle is invalid: ${formatErrors(completedValidation.errors)}`);
    }
    const completedRelative = path.posix.join(
      project.manifest.paths.convergence,
      "cycles",
      `${cycle.cycle_id}.json`,
    );
    await publishImmutable(
      path.resolve(project.root, completedRelative),
      `${JSON.stringify(completed, null, 2)}\n`,
    );
    await unlink(active.file);
    return {
      valid: true,
      cycle: completed,
      cycle_path: path.resolve(project.root, completedRelative),
      evaluation,
      evaluation_path: absolute,
      evaluation_reference: reference,
      state_written: true,
      blockers: [],
    };
  });
  return locked.lockFailure ?? locked.value;
}

function missingEvaluationStatus(cycle, pendingAction = null) {
  const requiredAction = cycle?.recovery_position ? {
    strategy: cycle.recovery_position.required_strategy,
    operation: cycle.recovery_position.operation,
    command: cycle.recovery_position.required_strategy,
  } : DEFAULT_ACTION;
  return {
    query_valid: true,
    outcome: "indeterminate",
    current: false,
    evaluation: null,
    cycle: cycle ?? null,
    pending_action: pendingAction,
    required_action: requiredAction,
    blockers: [{
      code: "current-evaluation-unavailable",
      message: "No current satisfied full-manuscript evaluation is available.",
      required_action: requiredAction,
    }],
  };
}

export async function getConvergenceStatus(projectRoot) {
  let project;
  let active;
  try {
    project = await readProject(projectRoot);
    active = await readActiveCycle(project);
  } catch (error) {
    return {
      query_valid: false,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      cycle: null,
      pending_action: null,
      required_action: null,
      blockers: [{ code: "cycle-state-invalid", message: error.message, required_action: null }],
    };
  }
  let cycle = active?.value ?? null;
  let reference = cycle?.target_evaluation ?? null;
  if (!reference && !cycle) {
    const completed = await completedCycles(project);
    cycle = completed.at(-1) ?? null;
    reference = cycle?.target_evaluation ?? null;
  }
  if (!reference) return missingEvaluationStatus(active?.value ?? null, project.manifest.pending_action ?? null);

  try {
    const result = await recomputeStoredEvaluation(project, cycle, reference);
    const requiredAction = active?.value?.recovery_position ? {
      strategy: active.value.recovery_position.required_strategy,
      operation: active.value.recovery_position.operation,
      command: active.value.recovery_position.required_strategy,
    } : result.recomputed.outcome === "satisfied" && result.current
      ? null
      : result.recomputed.blockers[0]?.required_action ?? DEFAULT_ACTION;
    return {
      query_valid: true,
      outcome: result.recomputed.outcome,
      current: result.current,
      evaluation: result.stored,
      evaluation_reference: reference,
      current_evaluation: result.recomputed,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      required_action: requiredAction,
      blockers: result.recomputed.blockers,
    };
  } catch (error) {
    return {
      query_valid: true,
      outcome: "indeterminate",
      current: false,
      evaluation: null,
      evaluation_reference: reference,
      cycle: active?.value ?? null,
      pending_action: project.manifest.pending_action ?? null,
      required_action: DEFAULT_ACTION,
      blockers: [{
        code: "current-evaluation-unavailable",
        message: `The stored evaluation cannot be trusted: ${error.message}`,
        required_action: DEFAULT_ACTION,
      }],
    };
  }
}

export async function findSatisfiedStartingEvaluation(project, scopeReference) {
  for (const cycle of (await completedCycles(project)).reverse()) {
    if (!sameScopeReference(cycle.target_scope, scopeReference) || !cycle.target_evaluation) continue;
    try {
      const result = await recomputeStoredEvaluation(project, cycle, cycle.target_evaluation);
      if (result.current && result.recomputed.outcome === "satisfied") {
        return {
          cycle,
          evaluation: result.stored,
          evaluation_reference: cycle.target_evaluation,
          current_evaluation: result.recomputed,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}
