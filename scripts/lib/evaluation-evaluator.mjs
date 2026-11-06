import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  canReuseCoverageUnit,
  validateCoverageIndex,
  validateCreationBatch,
  validateCreationCommit,
  validateStoryStateMarkdown,
} from "./artifacts.mjs";
import { collectManuscriptInventory } from "./manuscript.mjs";
import { externalReconciliationBlock } from "./cycles.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import {
  validateRevisionExecution,
  validateRevisionExecutionAgainstDisk,
} from "./revision-execution.mjs";
import {
  validateReaderStateForJob,
  validateReaderStateMarkdown,
  validateReviewJob,
} from "./review.mjs";
import {
  validateManuscriptReconciliationSchema,
  validateReaderStateSchema,
  validateReviewGroupSchema,
  validateReviewJobSchema,
  validateSemanticAttestationSchema,
} from "./schemas.mjs";
import {
  validateFullManuscriptScope,
  validateInventorySnapshot,
  validateScopeSnapshot,
} from "./scope.mjs";
import { sha256Bytes } from "./state-io.mjs";
import { parseTrackerState } from "./tracker.mjs";
import { formatErrors, latestSatisfiedPass } from "./evaluation-artifacts.mjs";
import { buildCreationCommitEvents, validateScopeEventChain } from "./evaluation-chains.mjs";
import {
  COVERAGE_OPERATIONS,
  DEFAULT_ACTION,
  PERSPECTIVES,
  deriveRequestedPassBaseline,
  passRequirements,
  samePassReference,
  sameReference,
  sameScopeReference,
  validateConvergenceEvaluation,
  validateNoEditSkip,
  validateRequestedPass,
  validateReviewGroup,
  validateSemanticAttestation,
} from "./evaluation-contracts.mjs";

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

export async function computeEvaluation(project, cycle, roots, evaluationId, createdAt) {
  const computation = newComputation(project, cycle, roots, evaluationId, createdAt);
  const { block, record } = computation;
  const relatedArtifacts = cycle?.related_artifacts ?? {
    revision_executions: roots.revision_executions ?? [],
    no_edit_skips: roots.no_edit_skips ?? [],
    review_groups: roots.review_group ? [roots.review_group] : [],
  };
  const wholeBook = cycle?.initiating_strategy === "revise-fiction";
  const currentScope = project.manifest.current_scope;
  const trackedReference = cycle?.target_scope ?? cycle?.starting_scope ??
    (currentScope ? {
      scope_id: currentScope.scope_id,
      scope_fingerprint: currentScope.scope_fingerprint,
      snapshot_path: currentScope.snapshot_path,
      snapshot_sha256: currentScope.snapshot_sha256,
    } : null);
  try {
    const external = await externalReconciliationBlock(project, trackedReference, cycle);
    if (external) {
      block(
        "external-reconciliation-required",
        external.blockers[0].message,
        "indeterminate",
        { required_action: external.required_action },
      );
    }
  } catch (error) {
    block(
      "external-inventory-unproven",
      `The previous manuscript inventory cannot be compared with current disk state: ${error.message}`,
    );
  }
  const fullScope = await validateFullManuscriptScope(project.manifest, project.manifestPath);
  const inventory = await collectManuscriptInventory(
    project.root,
    project.manifest.manuscript_root,
    project.manifest.paths,
  );
  const emptyManuscript = inventory.files.length === 0;
  if (!fullScope.valid || emptyManuscript) {
    const code = emptyManuscript ? "empty-manuscript" : "target-scope-not-current";
    block(
      code,
      `The target is not a current nonempty full-manuscript scope: ${formatErrors(fullScope.errors)}`,
      emptyManuscript ? "not_satisfied" : "indeterminate",
    );
  }
  if (!sameScopeReference(roots.target_scope, project.manifest.current_scope)) {
    const fields = [
      "scope_id",
      "scope_fingerprint",
      "snapshot_path",
      "snapshot_sha256",
    ].filter((field) => roots.target_scope?.[field] !== project.manifest.current_scope?.[field]);
    block(
      "target-scope-identity-mismatch",
      `Target scope reference does not match manifest current_scope: ${fields.join(", ")}.`,
      "indeterminate",
      {
        path: roots.target_scope.snapshot_path,
        artifact_id: roots.target_scope.scope_id,
      },
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

  if (cycle?.starting_scope) {
    const startingScope = await computation.json(
      {
        path: cycle?.starting_scope.snapshot_path,
        sha256: cycle?.starting_scope.snapshot_sha256,
      },
      "starting-scope",
      cycle?.starting_scope.scope_id,
      validateScopeSnapshot,
    );
    if (startingScope) {
      if (
        startingScope.scope_id !== cycle?.starting_scope.scope_id ||
        startingScope.scope_fingerprint !== cycle?.starting_scope.scope_fingerprint
      ) {
        block("starting-scope-identity-mismatch", "Starting scope identity differs from its preserved reference.");
      }
      if (startingScope.inventory) {
        await computation.json(
          startingScope.inventory,
          "starting-inventory",
          startingScope.inventory.inventory_fingerprint,
          validateInventorySnapshot,
        );
      }
    }
  }
  if (cycle?.starting_evaluation) {
    const startingEvaluation = await computation.json(
      cycle?.starting_evaluation,
      "starting-evaluation",
      cycle?.starting_evaluation.evaluation_id,
      validateConvergenceEvaluation,
    );
    if (
      startingEvaluation &&
      (startingEvaluation.evaluation_id !== cycle?.starting_evaluation.evaluation_id ||
        startingEvaluation.outcome !== "satisfied" ||
        !sameScopeReference(startingEvaluation.target_scope, cycle?.starting_scope))
    ) {
      block(
        "starting-evaluation-identity-mismatch",
        "The preserved starting evaluation is not satisfied for the cycle starting scope.",
      );
    }
  }
  const reconciliations = [];
  const reconciliationScopes = new Map();
  const reconciliationInventories = new Map();
  const reconciliationReferences = relatedArtifacts.reconciliations ?? [];
  for (const [index, reference] of reconciliationReferences.entries()) {
    const isLatest = index === reconciliationReferences.length - 1;
    const reconciliation = await computation.json(
      reference,
      "manuscript-reconciliation",
      reference.reconciliation_id,
      validateManuscriptReconciliationSchema,
    );
    if (!reconciliation) continue;
    reconciliations.push(reconciliation);
    if (reconciliation.target_scope) {
      const targetScope = await computation.json(
        {
          path: reconciliation.target_scope.snapshot_path,
          sha256: reconciliation.target_scope.snapshot_sha256,
        },
        "reconciliation-target-scope",
        `${reconciliation.reconciliation_id}:${reconciliation.target_scope.scope_id}`,
        validateScopeSnapshot,
      );
      if (targetScope) reconciliationScopes.set(reconciliation.reconciliation_id, targetScope);
      if (
        targetScope &&
        (targetScope.scope_id !== reconciliation.target_scope.scope_id ||
          targetScope.scope_fingerprint !== reconciliation.target_scope.scope_fingerprint)
      ) {
        block(
          "reconciliation-target-snapshot-mismatch",
          `Reconciliation ${reconciliation.reconciliation_id} has a different target snapshot identity.`,
        );
      }
    }
    if (
      reconciliation.reconciliation_id !== reference.reconciliation_id ||
      (reconciliation.cycle_id !== null && reconciliation.cycle_id !== roots.cycle_id)
    ) {
      block(
        "reconciliation-identity-mismatch",
        "Reconciliation identity or cycle ownership differs from the evaluated cycle.",
      );
    }
    if (isLatest) {
      for (const proof of reconciliation.proof_blockers) {
        block(proof.code, proof.message);
      }
    }
    const inventory = await computation.json(
      reconciliation.inventory,
      "reconciliation-inventory",
      reconciliation.inventory.inventory_fingerprint,
      validateInventorySnapshot,
    );
    if (inventory) reconciliationInventories.set(reconciliation.reconciliation_id, inventory);
    if (isLatest) {
      for (const storyReference of reconciliation.story_state) {
        const contents = await computation.bytes(storyReference, "story-state", storyReference.path);
        if (!contents) continue;
        const storyValidation = validateStoryStateMarkdown(contents.toString("utf8"));
        if (!storyValidation.valid) {
          block(
            "story-state-contract-invalid",
            `Reconciled story state ${storyReference.path} is invalid.`,
            "indeterminate",
            { path: storyReference.path },
          );
        }
      }
    }
  }
  const creationBatches = [];
  for (const reference of relatedArtifacts.creation_batches ?? []) {
    const batch = await computation.json(
      reference,
      "creation-batch",
      reference.batch_id,
      validateCreationBatch,
    );
    if (!batch) continue;
    creationBatches.push(batch);
    if (batch.batch_id !== reference.batch_id) {
      block("creation-batch-identity-mismatch", `Creation batch identity differs from ${reference.path}.`);
    }
  }
  const creationCommits = [];
  for (const reference of relatedArtifacts.creation_commits ?? []) {
    const commit = await computation.json(
      reference,
      "creation-commit",
      reference.commit_id,
      validateCreationCommit,
    );
    if (!commit) continue;
    creationCommits.push(commit);
    const batch = creationBatches.find((candidate) => candidate.batch_id === commit.batch_id);
    if (
      commit.commit_id !== reference.commit_id ||
      commit.batch_id !== reference.batch_id ||
      commit.status !== "committed" ||
      !batch ||
      batch.status !== "committed" ||
      batch.commit !== reference.path ||
      commit.scope_before_id !== (cycle?.starting_scope?.scope_id ?? null)
    ) {
      block(
        "creation-commit-identity-mismatch",
        `Creation commit ${reference.commit_id} is not a committed journal for the linked batch and starting scope.`,
      );
    }
  }
  const executionChain = [];
  const executionScopes = new Map();
  for (const reference of relatedArtifacts.revision_executions ?? []) {
    const execution = await computation.json(
      reference,
      "revision-execution",
      reference.execution_id,
      validateRevisionExecution,
    );
    if (execution?.status === "verified" && execution.cycle_id === roots.cycle_id) {
      executionChain.push(execution);
      const inputScope = await computation.json(
        {
          path: execution.input_scope.snapshot_path,
          sha256: execution.input_scope.snapshot_sha256,
        },
        "execution-input-scope",
        execution.input_scope.scope_id,
        validateScopeSnapshot,
      );
      const targetScope = await computation.json(
        {
          path: execution.target_scope.snapshot_path,
          sha256: execution.target_scope.snapshot_sha256,
        },
        "execution-target-scope",
        execution.execution_id,
        validateScopeSnapshot,
      );
      executionScopes.set(execution.execution_id, {
        input: inputScope,
        target: targetScope,
      });
    }
  }
  const creationEvents = await buildCreationCommitEvents(
    project,
    computation,
    cycle,
    roots,
    creationCommits,
    creationBatches,
    reconciliations,
    executionChain,
  );
  const eventValidation = creationEvents === null ? null : await validateScopeEventChain(
    project,
    computation,
    cycle,
    roots,
    reconciliations,
    reconciliationScopes,
    reconciliationInventories,
    executionChain,
    executionScopes,
    creationEvents,
  );
  if (reconciliations.length > 0 && !eventValidation) {
    block(
      "reconciliation-target-mismatch",
      "Reconciliation and execution events do not form a complete chain to the current target.",
    );
    block(
      "reconciliation-chain-mismatch",
      "The reconciliation and execution event chain has a missing, inconsistent, or non-current link.",
    );
  }
  if (cycle?.initiating_strategy === "write-fiction") {
    const changedTarget = cycle.bootstrap || !sameScopeReference(roots.target_scope, cycle.starting_scope);
    const importChain = creationCommits.length === 0 ? eventValidation?.chain ?? null : null;
    let approvedBootstrapImport = false;
    if (importChain) {
      const first = importChain[0];
      approvedBootstrapImport = eventValidation.approvalsValid &&
        first.type === "reconciliation" &&
        first.value.required_strategy === "revise-draft" &&
        !first.value.recovery_from_empty;
      if (!eventValidation.approvalsValid) {
        block(
          "creation-import-approval-missing",
          "The bootstrap import chain no longer has every exact approved creation-import decision.",
        );
      }
    }
    if (changedTarget && creationCommits.length === 0 && !approvedBootstrapImport) {
      block(
        "creation-commit-evidence-missing",
        "The creation target has no linked creation commit execution record or approved first bootstrap import.",
        "not_satisfied",
      );
    }
    for (const batch of creationBatches.filter((candidate) => candidate.status !== "rejected")) {
      if (
        batch.status !== "committed" ||
        !creationCommits.some((commit) => commit.batch_id === batch.batch_id && commit.status === "committed")
      ) {
        block(
          "creation-commit-evidence-missing",
          `Creation batch ${batch.batch_id} has no verified committed journal; acceptance is not publication.`,
          "not_satisfied",
          { artifact_id: batch.batch_id },
        );
      }
    }
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
    const baseline = await latestSatisfiedPass(project, roots.cycle_id, evaluationId);
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
        record("baseline-evaluation", baseline.evaluation.evaluation_id, baseline.evaluationReference);
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

  const wholeBookReportPaths = new Set();
  if (wholeBook) {
    for (const operation of ["story-bible", "structure", "final-review"]) {
      const requirement = passRequirements(pass, operation);
      if (!requirement || !sameVersionedFiles(targetFiles(scope, requirement?.paths), targetFiles(scope))) {
        block(
          "whole-book-operation-missing",
          `Manuscript-changing revise-fiction requires ${operation} over the complete target scope.`,
          "not_satisfied",
        );
      }
      if (operation === "final-review") continue;
      const matching = [...reports.values()].filter(({ report }) => report.stage === operation);
      if (matching.length !== 1) {
        block(
          "whole-book-operation-evidence-missing",
          `Expected exactly one current ${operation} report; found ${matching.length}.`,
        );
      }
      for (const loaded of matching) {
        wholeBookReportPaths.add(loaded.reference.path);
        const subchecks = loaded.report.engine.notes.match(/(?:^|\s)subchecks=([^\s]+)/)?.[1]?.split(",") ?? [];
        const missing = requirement?.subchecks.filter((subcheck) => !subchecks.includes(subcheck)) ?? [];
        if (missing.length > 0) {
          block(
            "whole-book-operation-evidence-missing",
            `${operation} report ${loaded.reference.path} lacks required subchecks: ${missing.join(", ")}.`,
            "not_satisfied",
          );
        }
      }
    }
    const storyBible = pass?.dependencies.find(
      (dependency) => dependency.path === project.manifest.paths.story_bible
    );
    if (!storyBible) {
      block(
        "whole-book-operation-missing",
        "The revise-fiction pass must bind the registered Story Bible artifact and its current hash.",
        "not_satisfied",
      );
    }
    const confirmations = tracker.approvals.filter((approval) => {
      if (approval.type !== "story-bible") return false;
      const tokens = String(approval.reason ?? "").split(/\s+/);
      return approval.status === "approved" &&
        approval.operation === "story-bible" &&
        approval.scopeId === roots.target_scope.scope_id &&
        JSON.stringify(approval.paths) === JSON.stringify(pass?.paths ?? []) &&
        tokens.includes(`pass_fingerprint=${roots.requested_pass.pass_fingerprint}`) &&
        tokens.includes(`scope_fingerprint=${roots.target_scope.scope_fingerprint}`) &&
        tokens.includes(`story_bible_sha256=${storyBible?.sha256 ?? "missing"}`);
    });
    if (confirmations.length !== 1) {
      block(
        "whole-book-story-bible-confirmation-missing",
        `Expected one current Story Bible confirmation bound to the pass, target fingerprint, complete paths, and Story Bible hash; found ${confirmations.length}.`,
      );
    }
  }

  const coverageIndex = await computation.json(
    roots.coverage_index,
    "coverage-index",
    roots.coverage_index.path,
    validateCoverageIndex,
  );
  const coverageClaimPaths = new Set([roots.coverage_index.path, ...wholeBookReportPaths]);
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
  }

  const executions = [];
  for (const reference of relatedArtifacts.revision_executions ?? []) {
    const execution = await computation.json(
      reference,
      "revision-execution",
      reference.execution_id,
      validateRevisionExecution,
    );
    if (!execution) continue;
    const currentExecution = samePassReference(execution.requested_pass, roots.requested_pass) &&
      sameScopeReference(execution.target_scope, roots.target_scope);
    executions.push({ execution, currentExecution });
    if (execution.execution_id !== reference.execution_id || execution.cycle_id !== roots.cycle_id) {
      block("revision-execution-identity-mismatch", `Revision execution ${reference.execution_id} is not bound to this cycle.`);
    }
    const disk = await validateRevisionExecutionAgainstDisk(project.root, execution, {
      expectedPass: currentExecution ? roots.requested_pass : execution.requested_pass,
      expectedScope: currentExecution ? roots.target_scope : execution.target_scope,
      requireOutputs: currentExecution && execution.status === "verified",
      requireCurrentTarget: currentExecution && execution.status === "verified",
      requireCurrentDecisions: currentExecution,
    });
    for (const error of disk.errors) {
      block(error.code, error.message, "indeterminate", {
        path: error.path,
        artifact_id: error.artifact_id ?? execution.execution_id,
      });
    }
    if (execution.status !== "verified") {
      block(
        "approved-edit-unexecuted",
        `Approved revision execution ${execution.execution_id} is ${execution.status}; approval is not verified execution.`,
        "not_satisfied",
        { artifact_id: execution.execution_id },
      );
    }
    await computation.bytes(execution.plan, "revision-plan", execution.plan.plan_id);
    await computation.bytes(execution.batch, "revision-batch", execution.batch.batch_id);
    const inputScope = await computation.json(
      {
        path: execution.input_scope.snapshot_path,
        sha256: execution.input_scope.snapshot_sha256,
      },
      "execution-input-scope",
      execution.input_scope.scope_id,
      validateScopeSnapshot,
    );
    if (inputScope?.inventory) {
      await computation.json(
        inputScope.inventory,
        "execution-input-inventory",
        inputScope.inventory.inventory_fingerprint,
        validateInventorySnapshot,
      );
      for (const file of inputScope.files) {
        record("execution-input-manuscript", `${execution.execution_id}:${file.path}`, file);
      }
    }
    for (const backup of execution.backups) {
      await computation.bytes(backup.manifest, "revision-backup-manifest", backup.backup_id);
      for (const file of backup.files) {
        await computation.bytes(
          { path: file.backup_path, sha256: file.sha256 },
          "revision-backup",
          backup.backup_id,
        );
      }
    }
  }
  const verifiedExecutions = executions
    .filter(({ execution, currentExecution }) => execution.status === "verified" && currentExecution)
    .map(({ execution }) => execution);

  const skips = [];
  for (const reference of relatedArtifacts.no_edit_skips ?? []) {
    const skip = await computation.json(reference, "no-edit-skip", reference.skip_id, validateNoEditSkip);
    if (!skip) continue;
    if (skip.skip_id !== reference.skip_id) {
      block("no-edit-identity-mismatch", `No-edit skip ${reference.skip_id} has a different artifact identity.`);
      continue;
    }
    if (
      samePassReference(skip.requested_pass, roots.requested_pass) &&
      skip.scope_fingerprint === roots.target_scope.scope_fingerprint
    ) {
      skips.push(skip);
    }
  }
  for (const operation of ["revision-plan", "chapter-revision"]) {
    if (!passRequirements(pass, operation)) {
      block("required-operation-missing", `Requested pass does not require ${operation}.`, "not_satisfied");
    }
    if (verifiedExecutions.length === 0 && !skips.some((skip) => skip.operations.includes(operation))) {
      block("no-edit-evidence-missing", `No verified execution or current no-edit skip covers ${operation}.`);
    }
  }
  const coveredFindings = new Set(skips.flatMap((skip) => skip.covered_findings));
  for (const findingId of currentFindingIds) {
    const finding = tracker.findings.find((candidate) => candidate.id === findingId);
    if (finding.status === "resolved") {
      const executed = verifiedExecutions.some((execution) =>
        execution.finding_dispositions.some((disposition) =>
          disposition.finding_id === findingId && disposition.disposition === "execute"
        )
      );
      if (!executed) {
        block(
          "verified-execution-required",
          `Resolved finding ${findingId} requires verified revision execution evidence rather than a no-edit skip.`,
          "not_satisfied",
          { artifact_id: findingId },
        );
      }
    } else {
      const requiredDisposition = finding.status === "deferred" ? "defer" : "dismiss";
      const decidedByExecution = verifiedExecutions.some((execution) =>
        execution.finding_dispositions.some((disposition) =>
          disposition.finding_id === findingId && disposition.disposition === requiredDisposition
        )
      );
      if (!decidedByExecution && !coveredFindings.has(findingId)) {
        block(
          "finding-author-decision-missing",
          `Current ${finding.status} finding ${findingId} lacks a matching execution disposition or an authorized no-edit skip.`,
          "not_satisfied",
          { artifact_id: findingId },
        );
      }
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
      !(relatedArtifacts.review_groups ?? []).some((reference) =>
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
      if (wholeBook && job.mode !== "final") {
        block(
          "whole-book-final-review-mismatch",
          `Review job ${job.job_id} is ${job.mode}; manuscript-changing revise-fiction requires final-review jobs.`,
          "not_satisfied",
        );
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
      if (wholeBook && loaded?.report.stage !== "final-review") {
        block(
          "whole-book-final-review-mismatch",
          `Review report ${reference.path} is not final-review evidence for the revise-fiction whole-book gate.`,
          "not_satisfied",
        );
      }
      if (loaded) reports.set(reference.path, loaded);
      reviewClaimPaths.add(reference.path);
    }
  }

  for (const finding of tracker.findings) {
    if (finding.status === "stale" || finding.status === "open") continue;
    if (!reports.has(finding.report)) {
      block(
        "finding-report-not-in-evidence",
        `Finding ${finding.id} names ${finding.report}, which is not in the evaluation evidence graph.`,
        "indeterminate",
        { path: finding.report, artifact_id: finding.id },
      );
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
    if (["manuscript", "execution-input-manuscript", "dependency", "attested-artifact"].includes(artifact.role)) continue;
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
