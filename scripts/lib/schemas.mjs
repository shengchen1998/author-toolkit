import { existsSync, readFileSync } from "node:fs";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const referencesRoot = [
  new URL("../../references/", import.meta.url),
  new URL("../../assets/references/", import.meta.url),
].find((url) => existsSync(url));

function readSchema(name) {
  return JSON.parse(readFileSync(new URL(name, referencesRoot), "utf8"));
}

const findingV1Schema = readSchema("finding-schema.json");
const findingV2Schema = readSchema("finding-schema-v2.json");
const relativePathSchema = readSchema("relative-path-schema.json");
const projectV31Schema = readSchema("project-schema-v3.1.json");
const reportSchema = readSchema("report-schema-v2.json");
const storyStateSchema = readSchema("story-state-schema.json");
const creationBatchSchema = readSchema("creation-batch-schema.json");
const creationCommitSchema = readSchema("creation-commit-schema.json");
const executionReceiptSchema = readSchema("execution-receipt-schema.json");
const coverageUnitSchema = readSchema("coverage-unit-schema.json");
const coverageIndexSchema = readSchema("coverage-index-schema.json");
const reviewJobSchema = readSchema("review-job-schema.json");
const readerStateSchema = readSchema("reader-state-schema.json");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(findingV1Schema, "finding-schema-v1.json");
ajv.addSchema(findingV2Schema);
ajv.addSchema(relativePathSchema);
ajv.addSchema(projectV31Schema);
ajv.addSchema(reportSchema);
ajv.addSchema(storyStateSchema);
ajv.addSchema(creationBatchSchema);
ajv.addSchema(creationCommitSchema);
ajv.addSchema(executionReceiptSchema);
ajv.addSchema(coverageUnitSchema);
ajv.addSchema(coverageIndexSchema);
ajv.addSchema(reviewJobSchema);
ajv.addSchema(readerStateSchema);

const findingV1Validator = ajv.getSchema("finding-schema-v1.json");
const findingV2Validator = ajv.getSchema("finding-schema-v2.json");
const relativePathValidator = ajv.getSchema("relative-path-schema.json");
const projectV31Validator = ajv.getSchema("project-schema-v3.1.json");
const reportValidator = ajv.getSchema("report-schema-v2.json");
const storyStateValidator = ajv.getSchema("story-state-schema.json");
const creationBatchValidator = ajv.getSchema("creation-batch-schema.json");
const creationCommitValidator = ajv.getSchema("creation-commit-schema.json");
const executionReceiptValidator = ajv.getSchema("execution-receipt-schema.json");
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
  return evaluate(projectV31Validator, value);
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

export function validateExecutionReceiptSchema(value) {
  return evaluate(executionReceiptValidator, value);
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
    ["project-schema-v3.1.json", projectV31Schema],
    ["report-schema-v2.json", reportSchema],
    ["story-state-schema.json", storyStateSchema],
    ["creation-batch-schema.json", creationBatchSchema],
    ["creation-commit-schema.json", creationCommitSchema],
    ["execution-receipt-schema.json", executionReceiptSchema],
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
