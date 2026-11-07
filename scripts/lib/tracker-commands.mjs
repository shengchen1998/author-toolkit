import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { formatApprovalPaths } from "./approval-paths.mjs";
import { runCheckpoint } from "./cycle-coordination.mjs";
import { validateExecutionDecision as validateExecutionDecisionEvidence } from "./execution-decision.mjs";
import { readProject } from "./evaluation-artifacts.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import { revisionApprovalFingerprint } from "./revision-execution.mjs";
import {
  validateRecordApprovalCommand,
  validateRecordFindingCommand,
  validateRecordFindingDecisionCommand,
  validateRelativePath,
} from "./schemas.mjs";
import { validateNoEditDecision as validateNoEditDecisionEvidence } from "./no-edit-decision.mjs";
import { validateDeployedReferences } from "./shared-references.mjs";
import { validateStaleDecision as validateStaleDecisionEvidence } from "./stale-decision.mjs";
import {
  acquireDirectoryLock,
  releaseDirectoryLock,
  sha256Bytes,
  writeAtomicVerified,
} from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";
import { parseTrackerState } from "./tracker.mjs";

function requiredAction(operation) {
  return {
    strategy: "author-project",
    operation,
    command: `author-project ${operation}`,
  };
}

function failure(code, message, operation, details = {}) {
  return {
    valid: false,
    state_written: false,
    required_action: requiredAction(operation),
    blockers: [{ code, message, ...details, required_action: requiredAction(operation) }],
    ...details,
  };
}

function commandError(code, message, details = {}) {
  const error = new Error(message);
  error.projectCode = code;
  error.projectDetails = details;
  return error;
}

function cell(value) {
  return String(value).replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

function referenceCell(value) {
  const text = String(value);
  return cell(/[|`,\r\n]/.test(text) ? formatApprovalPaths([text]) : text);
}

function findingLocation(location) {
  if (location.scope === "file") return location.file;
  if (location.scope === "chapter") return `${location.file}#chapter-${location.chapter}`;
  if (location.scope === "line") return `${location.file}:${location.line}`;
  return `${location.file}: ${location.quote}`;
}

function appendFinding(markdown, row) {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^ {0,3}##[ \t]+Findings[ \t]*$/.test(line));
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) break;
    if (/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(lines[index])) {
      lines.splice(index + 1, 0, row);
      return lines.join(eol);
    }
  }
  throw commandError("tracker-invalid", "The Findings table separator is unavailable.");
}

async function recoveryState(project, operation) {
  const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
  let trackerSha256 = null;
  try {
    trackerSha256 = sha256Bytes(await readFile(trackerPath));
  } catch {
  }
  return {
    required_action: requiredAction(operation),
    tracker_path: trackerPath,
    tracker_sha256: trackerSha256,
  };
}

async function validateFindingReport(project, request, options) {
  if (!validateRelativePath(request.finding.location.file).valid) {
    throw commandError("finding-location-invalid", "Finding location.file must be a portable project-relative path.");
  }
  const reportsRoot = project.manifest.paths.reports.replace(/\/?$/, "/");
  if (!request.report.startsWith(reportsRoot)) {
    throw commandError("finding-report-invalid", "The current report must be beneath the registered reports path.");
  }
  let markdown;
  try {
    markdown = await readFile(path.resolve(project.root, request.report), "utf8");
  } catch (error) {
    throw commandError("finding-report-unavailable", `Cannot read current report ${request.report}: ${error.message}`);
  }
  const validation = validateEvidenceReport(markdown, options);
  if (!validation.valid) {
    throw commandError("finding-report-invalid", "The current report does not satisfy report v2 evidence requirements.", {
      validation_errors: validation.errors,
    });
  }
  const envelope = validation.envelope;
  const reported = envelope.findings.find((candidate) => candidate.id === request.finding.id);
  if (
    envelope.stage !== request.operation ||
    !reported ||
    !isDeepStrictEqual(reported, request.finding)
  ) {
    throw commandError(
      "finding-report-mismatch",
      "The current report must contain the exact finding with the same operation and audit identity.",
    );
  }
}

export async function recordFinding(projectRoot, request, options = {}) {
  const operation = "record-finding";
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        operation,
      ),
      reference_errors: references.errors,
    };
  }
  const initial = await readProject(projectRoot);
  const lock = await acquireDirectoryLock(
    path.resolve(initial.root, initial.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
      now: options.now,
    },
  );
  if (!lock.acquired) {
    return failure(
      lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
      `Cannot coordinate tracker recording at ${lock.directory}: ${lock.error.message}`,
      operation,
      { lock_path: lock.directory },
    );
  }

  let project = initial;
  let outcome;
  let operationError;
  let stateWritten = false;
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
    const trackerBefore = await readFile(trackerPath, "utf8");
    if (
      request.expected_tracker_sha256 !== undefined &&
      sha256Bytes(trackerBefore) !== request.expected_tracker_sha256
    ) {
      throw commandError(
        "tracker-hash-conflict",
        "The tracker changed after the finding input was prepared; reread it before retrying.",
        {
          expected_sha256: request.expected_tracker_sha256,
          actual_sha256: sha256Bytes(trackerBefore),
        },
      );
    }
    const validation = validateRecordFindingCommand(request, options);
    if (!validation.valid) {
      throw commandError("finding-command-invalid", "The finding command does not satisfy its typed input contract.", {
        validation_errors: validation.errors,
      });
    }
    const tracker = await parseTrackerState(trackerBefore, project.root);
    if (!tracker.valid) {
      throw commandError("tracker-invalid", "The existing tracker is invalid; diagnose the external edit before recording a finding.", {
        validation_errors: tracker.errors,
      });
    }
    const duplicateIndex = tracker.findings.findIndex((candidate) => candidate.id === request.finding.id);
    if (duplicateIndex >= 0) {
      throw commandError("duplicate-finding-id", `Finding ID already exists: ${request.finding.id}`, {
        finding_id: request.finding.id,
        conflicts: [{
          finding_id: request.finding.id,
          row: duplicateIndex,
          report: tracker.findings[duplicateIndex].report,
        }],
      });
    }
    await validateFindingReport(project, request, options);
    const updatedAt = utcTimestamp(options);
    const row = `| ${cell(request.finding.id)} | ${cell(request.operation)} | ${cell(request.finding.audit)} | ${referenceCell(findingLocation(request.finding.location))} | open | ${referenceCell(request.report)} | ${updatedAt} | ${cell(request.reason)} |`;
    const trackerAfter = appendFinding(trackerBefore, row);
    const candidate = await parseTrackerState(trackerAfter, project.root);
    if (!candidate.valid) {
      throw commandError("finding-command-invalid", "The finding row does not satisfy the living tracker contract.", {
        validation_errors: candidate.errors,
      });
    }
    await writeAtomicVerified(trackerPath, trackerAfter);
    stateWritten = true;
    await runCheckpoint(options, "tracker-written");
    outcome = {
      valid: true,
      state_written: true,
      finding_id: request.finding.id,
      finding: candidate.findings.find((candidateFinding) => candidateFinding.id === request.finding.id),
      status: "open",
      updated_at: updatedAt,
      tracker_sha256: sha256Bytes(trackerAfter),
      required_action: requiredAction(operation),
      blockers: [],
    };
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release tracker lock ${lock.directory}: ${released.error.message}`,
        operation,
        { lock_path: lock.directory },
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "tracker-write-interrupted",
        operationError.message,
        operation,
        operationError.projectDetails,
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  return outcome;
}


function appendApproval(markdown, row) {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^ {0,3}##[ \t]+Approvals[ \t]*$/.test(line));
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) break;
    if (/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(lines[index])) {
      lines.splice(index + 1, 0, row);
      return lines.join(eol);
    }
  }
  throw commandError("tracker-invalid", "The Approvals table separator is unavailable.");
}

function approvalValidationError(message) {
  return commandError("approval-command-invalid", message);
}

async function validateRevisionArtifact(project, reference) {
  let contents;
  try {
    contents = await readFile(path.resolve(project.root, reference.path));
  } catch (error) {
    throw approvalValidationError(`Cannot read revision artifact ${reference.path}: ${error.message}`);
  }
  if (sha256Bytes(contents) !== reference.sha256) {
    throw approvalValidationError(`Revision artifact hash does not match its approval binding: ${reference.path}`);
  }
}

async function approvalReason(project, request) {
  if (JSON.stringify(request.paths) !== JSON.stringify(request.files.map((file) => file.path))) {
    throw approvalValidationError("Approval paths must equal the complete ordered file paths.");
  }
  if (new Set(request.paths).size !== request.paths.length) {
    throw approvalValidationError("Approval file paths must be unique.");
  }
  const revisionType = ["revision-plan", "edit"].includes(request.type);
  const expectedOperation = request.type === "revision-plan"
    ? "revision-plan"
    : request.type === "edit"
      ? "chapter-revision"
      : null;
  if (revisionType && request.operation !== expectedOperation) {
    throw approvalValidationError(`${request.type} approval requires operation ${expectedOperation}.`);
  }
  if (revisionType !== Boolean(request.revision)) {
    throw approvalValidationError("Revision plan and edit approvals require exactly one revision binding; other approval types forbid it.");
  }
  let revisionToken = null;
  if (request.revision) {
    for (const [index, file] of request.files.entries()) {
      if (!["create", "modify", "delete", "reorder"].includes(file.action)) {
        throw approvalValidationError(`Revision file ${index} has an invalid manuscript action.`);
      }
      if (file.action === "create" && file.input_sha256 !== null) {
        throw approvalValidationError("A create action requires a null input hash.");
      }
      if (file.action !== "create" && file.input_sha256 === null) {
        throw approvalValidationError(`${file.action} requires an input hash.`);
      }
      if (file.action === "delete" && file.output_sha256 !== null) {
        throw approvalValidationError("A delete action requires a null output hash.");
      }
      if (file.action !== "delete" && file.output_sha256 === null) {
        throw approvalValidationError(`${file.action} requires an output hash.`);
      }
      if (file.action === "modify" && file.input_sha256 === file.output_sha256) {
        throw approvalValidationError("A modify action must change manuscript content.");
      }
    }
    await validateRevisionArtifact(project, request.revision.plan);
    await validateRevisionArtifact(project, request.revision.batch);
    revisionToken = revisionApprovalFingerprint({
      plan: request.revision.plan,
      batch: request.revision.batch,
      input_scope: {
        scope_id: request.scope_id,
        scope_fingerprint: request.revision.scope_fingerprint,
      },
      files: request.files,
    }, request.operation);
  }
  const filesFingerprint = sha256Bytes(JSON.stringify({
    operation: request.operation,
    scope_id: request.scope_id,
    files: request.files,
  }));
  const tokens = [`approval_files=${filesFingerprint}`];
  if (request.revision) {
    tokens.push(
      `plan_id=${request.revision.plan.plan_id}`,
      `plan_sha256=${request.revision.plan.sha256}`,
      `batch_id=${request.revision.batch.batch_id}`,
      `batch_sha256=${request.revision.batch.sha256}`,
      `scope_fingerprint=${request.revision.scope_fingerprint}`,
      `revision_approval=${revisionToken}`,
    );
  }
  return `${request.reason.trim()} ${tokens.join(" ")}`;
}

export async function recordApproval(projectRoot, request, options = {}) {
  const operation = "record-approval";
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        operation,
      ),
      reference_errors: references.errors,
    };
  }
  const initial = await readProject(projectRoot);
  const lock = await acquireDirectoryLock(
    path.resolve(initial.root, initial.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
      now: options.now,
    },
  );
  if (!lock.acquired) {
    return failure(
      lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
      `Cannot coordinate tracker recording at ${lock.directory}: ${lock.error.message}`,
      operation,
      { lock_path: lock.directory },
    );
  }

  let project = initial;
  let outcome;
  let operationError;
  let stateWritten = false;
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
    const trackerBefore = await readFile(trackerPath, "utf8");
    if (
      request.expected_tracker_sha256 !== undefined &&
      sha256Bytes(trackerBefore) !== request.expected_tracker_sha256
    ) {
      throw commandError(
        "tracker-hash-conflict",
        "The tracker changed after the approval input was prepared; reread it before retrying.",
        {
          expected_sha256: request.expected_tracker_sha256,
          actual_sha256: sha256Bytes(trackerBefore),
        },
      );
    }
    const validation = validateRecordApprovalCommand(request, options);
    if (!validation.valid) {
      throw commandError("approval-command-invalid", "The approval command does not satisfy its typed input contract.", {
        validation_errors: validation.errors,
      });
    }
    const tracker = await parseTrackerState(trackerBefore, project.root);
    if (!tracker.valid) {
      throw commandError("tracker-invalid", "The existing tracker is invalid; diagnose the external edit before recording an approval.", {
        validation_errors: tracker.errors,
      });
    }
    const duplicateIndex = tracker.approvals.findIndex((candidate) => candidate.id === request.approval_id);
    if (duplicateIndex >= 0) {
      throw commandError("duplicate-approval-id", `Approval ID already exists: ${request.approval_id}`, {
        approval_id: request.approval_id,
        conflicts: [{
          approval_id: request.approval_id,
          row: duplicateIndex,
          operation: tracker.approvals[duplicateIndex].operation,
          scope_id: tracker.approvals[duplicateIndex].scopeId,
        }],
      });
    }
    const reason = await approvalReason(project, request);
    const updatedAt = utcTimestamp(options);
    const row = `| ${cell(request.approval_id)} | ${cell(request.type)} | ${cell(request.operation)} | ${cell(request.scope_id)} | ${cell(formatApprovalPaths(request.paths))} | ${request.status} | ${cell(reason)} | ${updatedAt} |`;
    const trackerAfter = appendApproval(trackerBefore, row);
    const candidate = await parseTrackerState(trackerAfter, project.root);
    if (!candidate.valid) {
      throw commandError("approval-command-invalid", "The approval row does not satisfy the living tracker contract.", {
        validation_errors: candidate.errors,
      });
    }
    await writeAtomicVerified(trackerPath, trackerAfter);
    stateWritten = true;
    await runCheckpoint(options, "tracker-written");
    outcome = {
      valid: true,
      state_written: true,
      approval_id: request.approval_id,
      approval: candidate.approvals.find((candidateApproval) => candidateApproval.id === request.approval_id),
      updated_at: updatedAt,
      tracker_sha256: sha256Bytes(trackerAfter),
      required_action: requiredAction(operation),
      blockers: [],
    };
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release tracker lock ${lock.directory}: ${released.error.message}`,
        operation,
        { lock_path: lock.directory },
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "tracker-write-interrupted",
        operationError.message,
        operation,
        operationError.projectDetails,
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  return outcome;
}


function replaceFinding(markdown, findingId, row) {
  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^ {0,3}##[ \t]+Findings[ \t]*$/.test(line));
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) break;
    if (lines[index].startsWith(`| ${findingId} |`)) {
      lines.splice(index, 1, row);
      return lines.join(eol);
    }
  }
  throw commandError("finding-decision-target-missing", `Finding is unavailable: ${findingId}`);
}

async function validateDecisionReport(project, request, existing, options) {
  const reportsRoot = project.manifest.paths.reports.replace(/\/?$/, "/");
  if (!request.report.startsWith(reportsRoot)) {
    throw commandError("finding-decision-report-invalid", "The current report must be beneath the registered reports path.");
  }
  let markdown;
  try {
    markdown = await readFile(path.resolve(project.root, request.report), "utf8");
  } catch (error) {
    throw commandError("finding-decision-report-unavailable", `Cannot read current report ${request.report}: ${error.message}`);
  }
  const validation = validateEvidenceReport(markdown, options);
  if (!validation.valid) {
    throw commandError("finding-decision-report-invalid", "The current report does not satisfy report v2 evidence requirements.", {
      validation_errors: validation.errors,
    });
  }
  if (validation.envelope.stage !== existing.stage) {
    throw commandError("finding-decision-report-mismatch", "The current report operation differs from the tracked finding.");
  }
  const reported = validation.envelope.findings.find((candidate) => candidate.id === request.finding_id) ?? null;
  if (["deferred", "dismissed"].includes(request.status)) {
    if (
      !reported ||
      reported.audit !== existing.audit ||
      findingLocation(reported.location) !== existing.location
    ) {
      throw commandError("finding-decision-report-mismatch", "The current report must retain the exact finding audit and location.");
    }
  }
  if (request.status === "stale") {
    if (reported) {
      throw commandError("finding-decision-report-mismatch", "A stale decision requires an equivalent current report that no longer observes the finding.");
    }
    if (!/(?:^|\s)operation_coverage=full(?:\s|$)/.test(validation.envelope.engine.notes)) {
      throw commandError("finding-decision-report-mismatch", "A stale decision requires an equivalent complete rerun.");
    }
  }
  return { envelope: validation.envelope, reported, markdown };
}

export async function recordFindingDecision(projectRoot, request, options = {}) {
  const operation = "record-finding-decision";
  const references = await validateDeployedReferences(projectRoot);
  if (!references.valid) {
    return {
      ...failure(
        "reference-version-conflict",
        "Shared references are missing or do not match the installed payload; run setup-author-toolkit.",
        operation,
      ),
      reference_errors: references.errors,
    };
  }
  const initial = await readProject(projectRoot);
  const lock = await acquireDirectoryLock(
    path.resolve(initial.root, initial.manifest.paths.convergence, "active-cycle.lock"),
    {
      timeoutMs: options.lockTimeoutMs ?? 10000,
      retryMs: options.lockRetryMs ?? 20,
      now: options.now,
    },
  );
  if (!lock.acquired) {
    return failure(
      lock.code === "timeout" ? "project-lock-timeout" : "project-lock-error",
      `Cannot coordinate tracker recording at ${lock.directory}: ${lock.error.message}`,
      operation,
      { lock_path: lock.directory },
    );
  }

  let project = initial;
  let outcome;
  let operationError;
  let stateWritten = false;
  try {
    await runCheckpoint(options, "lock-acquired");
    project = await readProject(projectRoot);
    const trackerPath = path.resolve(project.root, project.manifest.paths.audit_tracker);
    const trackerBefore = await readFile(trackerPath, "utf8");
    if (
      request.expected_tracker_sha256 !== undefined &&
      sha256Bytes(trackerBefore) !== request.expected_tracker_sha256
    ) {
      throw commandError(
        "tracker-hash-conflict",
        "The tracker changed after the finding-decision input was prepared; reread it before retrying.",
        {
          expected_sha256: request.expected_tracker_sha256,
          actual_sha256: sha256Bytes(trackerBefore),
        },
      );
    }
    const validation = validateRecordFindingDecisionCommand(request, options);
    if (!validation.valid) {
      throw commandError("finding-decision-command-invalid", "The finding-decision command does not satisfy its typed input contract.", {
        validation_errors: validation.errors,
      });
    }
    const tracker = await parseTrackerState(trackerBefore, project.root);
    if (!tracker.valid) {
      throw commandError("tracker-invalid", "The existing tracker is invalid; diagnose the external edit before recording a finding decision.", {
        validation_errors: tracker.errors,
      });
    }
    const existing = tracker.findings.find((candidate) => candidate.id === request.finding_id);
    if (!existing) {
      throw commandError("finding-decision-target-missing", `Finding is unavailable: ${request.finding_id}`);
    }
    if (
      existing.status === request.status ||
      existing.status === "stale" ||
      (existing.status === "resolved" && request.status !== "stale")
    ) {
      throw commandError(
        "finding-decision-transition-invalid",
        `Cannot record ${request.status} after ${existing.status} for ${request.finding_id}.`,
      );
    }
    const report = await validateDecisionReport(project, request, existing, options);
    if (request.status === "stale") {
      await validateStaleDecisionEvidence(project, tracker, request, report, existing, options);
    } else if (request.revision_execution) {
      await validateExecutionDecisionEvidence(project, tracker, request, report, existing, {
        ...options,
        pendingFindingDecision: { findingId: request.finding_id, status: request.status },
      });
    } else if (request.no_edit_skip) {
      await validateNoEditDecisionEvidence(project, tracker, request, report, options);
    } else {
      throw commandError("finding-decision-evidence-required", "The requested finding decision requires current evidence.");
    }
    const updatedAt = utcTimestamp(options);
    const previousReportSha256 = sha256Bytes(await readFile(path.resolve(project.root, existing.report)));
    const evidence = request.revision_execution
      ? { reference: request.revision_execution, id: request.revision_execution.execution_id, type: "revision-execution" }
      : request.no_edit_skip
        ? { reference: request.no_edit_skip, id: request.no_edit_skip.skip_id, type: "no-edit-skip" }
        : null;
    const evidenceReason = evidence
      ? ` evidence_type=${evidence.type} evidence_id=${evidence.id} evidence_path=${encodeURIComponent(evidence.reference.path)} evidence_sha256=${evidence.reference.sha256}`
      : "";
    const reason = `${request.reason.trim()} author_decision_id=${request.author_decision_id} finding_status=${request.status} previous_report=${encodeURIComponent(existing.report)} previous_report_sha256=${previousReportSha256} report_sha256=${sha256Bytes(report.markdown)}${evidenceReason}`;
    const row = `| ${cell(existing.id)} | ${cell(existing.stage)} | ${cell(existing.audit)} | ${referenceCell(existing.location)} | ${request.status} | ${referenceCell(request.report)} | ${updatedAt} | ${cell(reason)} |`;
    const trackerAfter = replaceFinding(trackerBefore, existing.id, row);
    const candidate = await parseTrackerState(trackerAfter, project.root);
    if (!candidate.valid) {
      throw commandError("finding-decision-command-invalid", "The finding decision does not satisfy the living tracker contract.", {
        validation_errors: candidate.errors,
      });
    }
    await writeAtomicVerified(trackerPath, trackerAfter);
    stateWritten = true;
    await runCheckpoint(options, "tracker-written");
    outcome = {
      valid: true,
      state_written: true,
      finding_id: request.finding_id,
      finding: candidate.findings.find((candidateFinding) => candidateFinding.id === request.finding_id),
      author_decision_id: request.author_decision_id,
      updated_at: updatedAt,
      tracker_sha256: sha256Bytes(trackerAfter),
      required_action: requiredAction(operation),
      blockers: [],
    };
  } catch (error) {
    operationError = error;
  }
  const released = await releaseDirectoryLock(lock);
  if (!released.released) {
    return {
      ...failure(
        "project-lock-release-error",
        `Cannot release tracker lock ${lock.directory}: ${released.error.message}`,
        operation,
        { lock_path: lock.directory },
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  if (operationError) {
    return {
      ...failure(
        operationError.projectCode ?? "tracker-write-interrupted",
        operationError.message,
        operation,
        operationError.projectDetails,
      ),
      state_written: stateWritten,
      recovery: await recoveryState(project, operation),
    };
  }
  return outcome;
}

