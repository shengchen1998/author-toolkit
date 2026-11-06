import { validateMarkdownEnvelope } from "./markdown.mjs";
import { sha256Bytes } from "./state-io.mjs";
import {
  validateCreationBatchSchema,
  validateCreationCommitSchema,
  validateCoverageIndexSchema,
  validateCoverageUnitSchema,
  validateStoryState,
} from "./schemas.mjs";

export function validateStoryStateMarkdown(markdown) {
  return validateMarkdownEnvelope(markdown, validateStoryState);
}

function validateFileHashes(file, index, errors, contract) {
  const creation = contract === "creation";
  const noun = creation ? "manuscript path" : "path";
  if (file.action === "create" && file.input_sha256 !== null) {
    errors.push({
      instancePath: `/files/${index}/input_sha256`,
      keyword: `${contract}-input`,
      message: `a created ${noun} must have a null input hash`,
      params: {},
    });
  }
  if (
    file.action !== "create" &&
    (creation ? file.input_sha256 === null : !file.input_sha256)
  ) {
    errors.push({
      instancePath: `/files/${index}/input_sha256`,
      keyword: `${contract}-input`,
      message: `an existing ${noun} requires its ${creation ? "original " : ""}input hash`,
      params: {},
    });
  }
  if (file.action === "delete" && file.output_sha256 !== null) {
    errors.push({
      instancePath: `/files/${index}/output_sha256`,
      keyword: `${contract}-output`,
      message: `a deleted ${noun} must have a null output hash`,
      params: {},
    });
  }
  const publishedStatuses = creation
    ? ["accepted", "written", "verified"]
    : ["written", "verified"];
  if (file.action !== "delete" && publishedStatuses.includes(file.status) && !file.output_sha256) {
    errors.push({
      instancePath: `/files/${index}/output_sha256`,
      keyword: `${contract}-output`,
      message: creation
        ? "accepted and published files require an output hash"
        : "written and verified files require an output hash",
      params: {},
    });
  }
}

function compareCreationText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function creationDependencyFingerprint(batch) {
  const context = batch.plan.context.map(({ path: filePath, version, version_type }) => ({
    path: filePath,
    version,
    version_type,
  })).sort((left, right) =>
    compareCreationText(left.path, right.path) ||
    compareCreationText(left.version_type, right.version_type) ||
    compareCreationText(left.version, right.version)
  );
  const files = batch.files.map(({ path: filePath, action, input_sha256 }) => ({
    path: filePath,
    action,
    input_sha256,
  })).sort((left, right) => compareCreationText(left.path, right.path));
  return sha256Bytes(JSON.stringify({ plan: batch.plan.summary, context, files }));
}

export function creationApprovalBindingMatches(approval, batch, scopeFingerprint) {
  if (batch.plan.dependency_fingerprint !== creationDependencyFingerprint(batch)) return false;
  const tokens = new Set(approval.reason.split(/\s+/));
  return tokens.has(`batch_id=${batch.batch_id}`) &&
    tokens.has(`dependency_fingerprint=${batch.plan.dependency_fingerprint}`) &&
    tokens.has(`scope_fingerprint=${scopeFingerprint}`);
}

export function sameApprovalPaths(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function validateCreationBatch(value) {
  const result = validateCreationBatchSchema(value);
  const errors = [...result.errors];
  for (const [index, file] of (value?.files ?? []).entries()) {
    validateFileHashes(file, index, errors, "creation");
  }
  const requiredApprovals = { accepted: 2, committed: 2, restored: 3 }[value?.status];
  const approvals = Array.isArray(value?.approvals) ? value.approvals : [];
  if (requiredApprovals && new Set(approvals).size < requiredApprovals) {
    errors.push({
      instancePath: "/approvals",
      keyword: "creation-approvals",
      message:
        value.status === "restored"
          ? "a restored batch requires distinct manuscript, scope, and restore approvals"
          : "an accepted or committed batch requires distinct manuscript and scope approvals",
      params: {},
    });
  }
  if (value?.status === "committed") {
    if (!value.commit) {
      errors.push({
        instancePath: "/commit",
        keyword: "creation-commit",
        message: "a committed batch requires its commit journal path",
        params: {},
      });
    }
    for (const [index, file] of (value.files ?? []).entries()) {
      if (file.status !== "verified") {
        errors.push({
          instancePath: `/files/${index}/status`,
          keyword: "creation-commit",
          message: "a committed batch requires every file to be verified",
          params: {},
        });
      }
    }
  }
  return { ...result, valid: errors.length === 0, errors };
}

export function validateCreationCommit(value) {
  const result = validateCreationCommitSchema(value);
  const errors = [...result.errors];
  const files = Array.isArray(value?.files) ? value.files : [];

  for (const [index, file] of files.entries()) {
    if (!file || typeof file !== "object") continue;
    validateFileHashes(file, index, errors, "commit");
    if (file.action !== "create" && !file.backup_id) {
      errors.push({
        instancePath: `/files/${index}/backup_id`,
        keyword: "commit-backup",
        message: "an existing path requires a backup ID",
        params: {},
      });
    }
    if (value?.status === "committed" && file.status !== "verified") {
      errors.push({
        instancePath: `/files/${index}/status`,
        keyword: "commit-status",
        message: "a committed journal requires every file to be verified",
        params: {},
      });
    }
    if (value?.status === "restored" && file.status !== "restored") {
      errors.push({
        instancePath: `/files/${index}/status`,
        keyword: "commit-status",
        message: "a restored journal requires every file to be restored",
        params: {},
      });
    }
  }

  return { ...result, valid: errors.length === 0, errors };
}

function sameVersionedPaths(left, right, ordered) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  if (ordered) {
    return left.every(
      (item, index) => item?.path === right[index]?.path && item?.sha256 === right[index]?.sha256,
    );
  }
  const keys = (items) => items.map((item) => `${item?.path}\0${item?.sha256}`).sort();
  const leftKeys = keys(left);
  const rightKeys = keys(right);
  return leftKeys.every((key, index) => key === rightKeys[index]);
}

export function canReuseCoverageUnit(unit, requested) {
  if (!validateCoverageUnitSchema(unit).valid || unit.kind !== "local" || unit.coverage !== "full") {
    return false;
  }
  if (
    !requested ||
    unit.source_report !== requested.source_report ||
    unit.operation !== requested.operation ||
    !sameVersionedPaths(unit.paths, requested.paths, true)
  ) {
    return false;
  }
  if (!Array.isArray(requested.subchecks) || unit.subchecks.length !== requested.subchecks.length) {
    return false;
  }
  const unitSubchecks = [...unit.subchecks].sort();
  const requestedSubchecks = [...requested.subchecks].sort();
  return (
    unitSubchecks.every((subcheck, index) => subcheck === requestedSubchecks[index]) &&
    sameVersionedPaths(unit.dependencies, requested.dependencies, false)
  );
}

export function validateCoverageIndex(value) {
  const result = validateCoverageIndexSchema(value);
  const errors = [...result.errors];
  const entries = Array.isArray(value?.entries) ? value.entries : [];
  const operations = new Set();

  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object") continue;
    if (operations.has(entry.operation)) {
      errors.push({
        instancePath: `/entries/${index}/operation`,
        keyword: "coverage-operation",
        message: "an operation can appear only once in a coverage index",
        params: {},
      });
    }
    operations.add(entry.operation);
    if (entry.synthesis_coverage && !entry.synthesis_report) {
      errors.push({
        instancePath: `/entries/${index}/synthesis_report`,
        keyword: "coverage-synthesis",
        message: "recorded synthesis coverage requires its synthesis report",
        params: {},
      });
    }
    if (entry.synthesis_report && !entry.synthesis_coverage) {
      errors.push({
        instancePath: `/entries/${index}/synthesis_coverage`,
        keyword: "coverage-synthesis",
        message: "a synthesis report requires its actual coverage",
        params: {},
      });
    }
  }

  return { ...result, valid: errors.length === 0, errors };
}
