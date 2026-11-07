import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateEvidenceTimestamps } from "./time.mjs";

const packagedReferences = globalThis[Symbol.for("author-toolkit.packaged-references")];

function readSchema(name) {
  const schemaUrl = packagedReferences
    ? new URL(name, packagedReferences)
    : new URL(`../../references/${name}`, import.meta.url);
  return JSON.parse(readFileSync(schemaUrl, "utf8"));
}

const findingV1Schema = readSchema("finding-schema.json");
const findingV2Schema = readSchema("finding-schema-v2.json");
const relativePathSchema = readSchema("relative-path-schema.json");
const projectSchema = readSchema("project-schema.json");
const projectV3Schema = readSchema("project-schema-v3.json");
const projectV31Schema = readSchema("project-schema-v3.1.json");
const projectV32Schema = readSchema("project-schema-v3.2.json");
const scopeSnapshotSchema = readSchema("scope-snapshot-schema.json");
const inventorySnapshotSchema = readSchema("inventory-snapshot-schema.json");
const convergenceCycleSchema = readSchema("convergence-cycle-schema.json");
const requestedPassSchema = readSchema("requested-pass-schema.json");
const noEditSkipSchema = readSchema("no-edit-skip-schema.json");
const reviewGroupSchema = readSchema("review-group-schema.json");
const semanticAttestationSchema = readSchema("semantic-attestation-schema.json");
const convergenceEvaluationSchema = readSchema("convergence-evaluation-schema.json");
const revisionExecutionSchema = readSchema("revision-execution-schema.json");
const manuscriptReconciliationSchema = readSchema("manuscript-reconciliation-schema.json");
const reportSchema = readSchema("report-schema-v2.json");
const storyStateSchema = readSchema("story-state-schema.json");
const creationBatchSchema = readSchema("creation-batch-schema.json");
const creationCommitSchema = readSchema("creation-commit-schema.json");
const coverageUnitSchema = readSchema("coverage-unit-schema.json");
const coverageIndexSchema = readSchema("coverage-index-schema.json");
const reviewJobSchema = readSchema("review-job-schema.json");
const readerStateSchema = readSchema("reader-state-schema.json");
const recordFindingCommandSchema = readSchema("record-finding-command-schema.json");
const recordApprovalCommandSchema = readSchema("record-approval-command-schema.json");
const recordFindingDecisionCommandSchema = readSchema("record-finding-decision-command-schema.json");
const backupManifestSchema = readSchema("backup-manifest-schema.json");
const backupIndexSchema = readSchema("backup-index-schema.json");
const recordBackupCommandSchema = readSchema("record-backup-command-schema.json");
const recordRestoreCommandSchema = readSchema("record-restore-command-schema.json");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(findingV1Schema, "finding-schema-v1.json");
ajv.addSchema(findingV2Schema);
ajv.addSchema(relativePathSchema);
ajv.addSchema(projectSchema);
ajv.addSchema(projectV3Schema);
ajv.addSchema(projectV31Schema);
ajv.addSchema(projectV32Schema);
ajv.addSchema(scopeSnapshotSchema);
ajv.addSchema(inventorySnapshotSchema);
ajv.addSchema(convergenceCycleSchema);
ajv.addSchema(requestedPassSchema);
ajv.addSchema(noEditSkipSchema);
ajv.addSchema(reviewGroupSchema);
ajv.addSchema(semanticAttestationSchema);
ajv.addSchema(convergenceEvaluationSchema);
ajv.addSchema(revisionExecutionSchema);
ajv.addSchema(manuscriptReconciliationSchema);
ajv.addSchema(reportSchema);
ajv.addSchema(storyStateSchema);
ajv.addSchema(creationBatchSchema);
ajv.addSchema(creationCommitSchema);
ajv.addSchema(coverageUnitSchema);
ajv.addSchema(coverageIndexSchema);
ajv.addSchema(reviewJobSchema);
ajv.addSchema(readerStateSchema);
ajv.addSchema(recordFindingCommandSchema);
ajv.addSchema(recordApprovalCommandSchema);
ajv.addSchema(recordFindingDecisionCommandSchema);
ajv.addSchema(backupManifestSchema);
ajv.addSchema(backupIndexSchema);
ajv.addSchema(recordBackupCommandSchema);
ajv.addSchema(recordRestoreCommandSchema);

const findingV1Validator = ajv.getSchema("finding-schema-v1.json");
const findingV2Validator = ajv.getSchema("finding-schema-v2.json");
const relativePathValidator = ajv.getSchema("relative-path-schema.json");
const projectValidator = ajv.getSchema("project-schema.json");
const projectV3Validator = ajv.getSchema("project-schema-v3.json");
const projectV31Validator = ajv.getSchema("project-schema-v3.1.json");
const projectV32Validator = ajv.getSchema("project-schema-v3.2.json");
const scopeSnapshotValidator = ajv.getSchema("scope-snapshot-schema.json");
const inventorySnapshotValidator = ajv.getSchema("inventory-snapshot-schema.json");
const convergenceCycleValidator = ajv.getSchema("convergence-cycle-schema.json");
const requestedPassValidator = ajv.getSchema("requested-pass-schema.json");
const noEditSkipValidator = ajv.getSchema("no-edit-skip-schema.json");
const reviewGroupValidator = ajv.getSchema("review-group-schema.json");
const semanticAttestationValidator = ajv.getSchema("semantic-attestation-schema.json");
const convergenceEvaluationValidator = ajv.getSchema("convergence-evaluation-schema.json");
const revisionExecutionValidator = ajv.getSchema("revision-execution-schema.json");
const manuscriptReconciliationValidator = ajv.getSchema("manuscript-reconciliation-schema.json");
const reportValidator = ajv.getSchema("report-schema-v2.json");
const storyStateValidator = ajv.getSchema("story-state-schema.json");
const creationBatchValidator = ajv.getSchema("creation-batch-schema.json");
const creationCommitValidator = ajv.getSchema("creation-commit-schema.json");
const coverageUnitValidator = ajv.getSchema("coverage-unit-schema.json");
const coverageIndexValidator = ajv.getSchema("coverage-index-schema.json");
const reviewJobValidator = ajv.getSchema("review-job-schema.json");
const readerStateValidator = ajv.getSchema("reader-state-schema.json");
const recordFindingCommandValidator = ajv.getSchema("record-finding-command-schema.json");
const recordApprovalCommandValidator = ajv.getSchema("record-approval-command-schema.json");
const recordFindingDecisionCommandValidator = ajv.getSchema("record-finding-decision-command-schema.json");
const backupManifestValidator = ajv.getSchema("backup-manifest-schema.json");
const backupIndexValidator = ajv.getSchema("backup-index-schema.json");
const recordBackupCommandValidator = ajv.getSchema("record-backup-command-schema.json");
const recordRestoreCommandValidator = ajv.getSchema("record-restore-command-schema.json");

function evaluate(validator, value, options = {}) {
  const schemaValid = validator(value);
  const errors = [
    ...(schemaValid ? [] : validator.errors.map((error) => ({ ...error }))),
    ...validateEvidenceTimestamps(value, options),
  ];
  return { valid: errors.length === 0, errors };
}

export function validateFindingV1(value, options = {}) {
  return evaluate(findingV1Validator, value, options);
}

export function validateFindingV2(value, options = {}) {
  return evaluate(findingV2Validator, value, options);
}

export function validateProjectSchema(value, options = {}) {
  return evaluate(projectValidator, value, options);
}

export function validateProjectV3Schema(value, options = {}) {
  return evaluate(projectV3Validator, value, options);
}

export function validateProjectV31Schema(value, options = {}) {
  return evaluate(projectV31Validator, value, options);
}

export function validateProjectV32Schema(value, options = {}) {
  return evaluate(projectV32Validator, value, options);
}

export function validateScopeSnapshotSchema(value, options = {}) {
  return evaluate(scopeSnapshotValidator, value, options);
}

export function validateInventorySnapshotSchema(value, options = {}) {
  return evaluate(inventorySnapshotValidator, value, options);
}

export function validateConvergenceCycleSchema(value, options = {}) {
  return evaluate(convergenceCycleValidator, value, options);
}

export function validateRequestedPassSchema(value, options = {}) {
  return evaluate(requestedPassValidator, value, options);
}

export function validateNoEditSkipSchema(value, options = {}) {
  return evaluate(noEditSkipValidator, value, options);
}

export function validateReviewGroupSchema(value, options = {}) {
  return evaluate(reviewGroupValidator, value, options);
}

export function validateSemanticAttestationSchema(value, options = {}) {
  return evaluate(semanticAttestationValidator, value, options);
}

export function validateConvergenceEvaluationSchema(value, options = {}) {
  return evaluate(convergenceEvaluationValidator, value, options);
}

export function validateRevisionExecutionSchema(value, options = {}) {
  return evaluate(revisionExecutionValidator, value, options);
}

export function validateManuscriptReconciliationSchema(value, options = {}) {
  return evaluate(manuscriptReconciliationValidator, value, options);
}

export function validateReportEnvelope(value, options = {}) {
  return evaluate(reportValidator, value, options);
}

export function validateRelativePath(value, options = {}) {
  return evaluate(relativePathValidator, value, options);
}

export function validateStoryState(value, options = {}) {
  return evaluate(storyStateValidator, value, options);
}

export function validateCreationBatchSchema(value, options = {}) {
  return evaluate(creationBatchValidator, value, options);
}

export function validateCreationCommitSchema(value, options = {}) {
  return evaluate(creationCommitValidator, value, options);
}

export function validateCoverageUnitSchema(value, options = {}) {
  return evaluate(coverageUnitValidator, value, options);
}

export function validateCoverageIndexSchema(value, options = {}) {
  return evaluate(coverageIndexValidator, value, options);
}

export function validateReviewJobSchema(value, options = {}) {
  return evaluate(reviewJobValidator, value, options);
}

export function validateReaderStateSchema(value, options = {}) {
  return evaluate(readerStateValidator, value, options);
}

export function validateRecordFindingCommand(value, options = {}) {
  return evaluate(recordFindingCommandValidator, value, options);
}

export function validateRecordApprovalCommand(value, options = {}) {
  return evaluate(recordApprovalCommandValidator, value, options);
}

export function validateRecordFindingDecisionCommand(value, options = {}) {
  return evaluate(recordFindingDecisionCommandValidator, value, options);
}

export function validateBackupManifestSchema(value, options = {}) {
  return evaluate(backupManifestValidator, value, options);
}

export function validateBackupIndexSchema(value, options = {}) {
  return evaluate(backupIndexValidator, value, options);
}

export function validateRecordBackupCommand(value, options = {}) {
  return evaluate(recordBackupCommandValidator, value, options);
}

export function validateRecordRestoreCommand(value, options = {}) {
  return evaluate(recordRestoreCommandValidator, value, options);
}

export function validateSchemaDefinitions() {
  const errors = [];
  const schemas = [
    ["finding-schema.json", findingV1Schema],
    ["finding-schema-v2.json", findingV2Schema],
    ["relative-path-schema.json", relativePathSchema],
    ["project-schema.json", projectSchema],
    ["project-schema-v3.json", projectV3Schema],
    ["project-schema-v3.1.json", projectV31Schema],
    ["project-schema-v3.2.json", projectV32Schema],
    ["scope-snapshot-schema.json", scopeSnapshotSchema],
    ["inventory-snapshot-schema.json", inventorySnapshotSchema],
    ["convergence-cycle-schema.json", convergenceCycleSchema],
    ["requested-pass-schema.json", requestedPassSchema],
    ["no-edit-skip-schema.json", noEditSkipSchema],
    ["review-group-schema.json", reviewGroupSchema],
    ["semantic-attestation-schema.json", semanticAttestationSchema],
    ["convergence-evaluation-schema.json", convergenceEvaluationSchema],
    ["revision-execution-schema.json", revisionExecutionSchema],
    ["manuscript-reconciliation-schema.json", manuscriptReconciliationSchema],
    ["report-schema-v2.json", reportSchema],
    ["story-state-schema.json", storyStateSchema],
    ["creation-batch-schema.json", creationBatchSchema],
    ["creation-commit-schema.json", creationCommitSchema],
    ["coverage-unit-schema.json", coverageUnitSchema],
    ["coverage-index-schema.json", coverageIndexSchema],
    ["review-job-schema.json", reviewJobSchema],
    ["reader-state-schema.json", readerStateSchema],
    ["record-finding-command-schema.json", recordFindingCommandSchema],
    ["record-approval-command-schema.json", recordApprovalCommandSchema],
    ["record-finding-decision-command-schema.json", recordFindingDecisionCommandSchema],
    ["backup-manifest-schema.json", backupManifestSchema],
    ["backup-index-schema.json", backupIndexSchema],
    ["record-backup-command-schema.json", recordBackupCommandSchema],
    ["record-restore-command-schema.json", recordRestoreCommandSchema],
  ];

  for (const [name, schema] of schemas) {
    if (!ajv.validateSchema(schema)) {
      for (const error of ajv.errors ?? []) {
        errors.push({ ...error, instancePath: `/${name}${error.instancePath}` });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
