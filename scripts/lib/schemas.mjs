import { readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

function readSchema(name) {
  return JSON.parse(readFileSync(new URL(`../../references/${name}`, import.meta.url), "utf8"));
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
const reportSchema = readSchema("report-schema-v2.json");
const storyStateSchema = readSchema("story-state-schema.json");
const creationBatchSchema = readSchema("creation-batch-schema.json");
const creationCommitSchema = readSchema("creation-commit-schema.json");
const coverageUnitSchema = readSchema("coverage-unit-schema.json");
const coverageIndexSchema = readSchema("coverage-index-schema.json");
const reviewJobSchema = readSchema("review-job-schema.json");
const readerStateSchema = readSchema("reader-state-schema.json");

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
ajv.addSchema(reportSchema);
ajv.addSchema(storyStateSchema);
ajv.addSchema(creationBatchSchema);
ajv.addSchema(creationCommitSchema);
ajv.addSchema(coverageUnitSchema);
ajv.addSchema(coverageIndexSchema);
ajv.addSchema(reviewJobSchema);
ajv.addSchema(readerStateSchema);

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
const reportValidator = ajv.getSchema("report-schema-v2.json");
const storyStateValidator = ajv.getSchema("story-state-schema.json");
const creationBatchValidator = ajv.getSchema("creation-batch-schema.json");
const creationCommitValidator = ajv.getSchema("creation-commit-schema.json");
const coverageUnitValidator = ajv.getSchema("coverage-unit-schema.json");
const coverageIndexValidator = ajv.getSchema("coverage-index-schema.json");
const reviewJobValidator = ajv.getSchema("review-job-schema.json");
const readerStateValidator = ajv.getSchema("reader-state-schema.json");

function evaluate(validator, value) {
  const valid = validator(value);
  return {
    valid,
    errors: valid ? [] : validator.errors.map((error) => ({ ...error })),
  };
}

export function validateFindingV1(value) {
  return evaluate(findingV1Validator, value);
}

export function validateFindingV2(value) {
  return evaluate(findingV2Validator, value);
}

export function validateProjectSchema(value) {
  return evaluate(projectValidator, value);
}

export function validateProjectV3Schema(value) {
  return evaluate(projectV3Validator, value);
}

export function validateProjectV31Schema(value) {
  return evaluate(projectV31Validator, value);
}

export function validateProjectV32Schema(value) {
  return evaluate(projectV32Validator, value);
}

export function validateScopeSnapshotSchema(value) {
  return evaluate(scopeSnapshotValidator, value);
}

export function validateInventorySnapshotSchema(value) {
  return evaluate(inventorySnapshotValidator, value);
}

export function validateConvergenceCycleSchema(value) {
  return evaluate(convergenceCycleValidator, value);
}

export function validateReportEnvelope(value) {
  return evaluate(reportValidator, value);
}

export function validateRelativePath(value) {
  return evaluate(relativePathValidator, value);
}

export function validateStoryState(value) {
  return evaluate(storyStateValidator, value);
}

export function validateCreationBatchSchema(value) {
  return evaluate(creationBatchValidator, value);
}

export function validateCreationCommitSchema(value) {
  return evaluate(creationCommitValidator, value);
}

export function validateCoverageUnitSchema(value) {
  return evaluate(coverageUnitValidator, value);
}

export function validateCoverageIndexSchema(value) {
  return evaluate(coverageIndexValidator, value);
}

export function validateReviewJobSchema(value) {
  return evaluate(reviewJobValidator, value);
}

export function validateReaderStateSchema(value) {
  return evaluate(readerStateValidator, value);
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
    ["report-schema-v2.json", reportSchema],
    ["story-state-schema.json", storyStateSchema],
    ["creation-batch-schema.json", creationBatchSchema],
    ["creation-commit-schema.json", creationCommitSchema],
    ["coverage-unit-schema.json", coverageUnitSchema],
    ["coverage-index-schema.json", coverageIndexSchema],
    ["review-job-schema.json", reviewJobSchema],
    ["reader-state-schema.json", readerStateSchema],
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
