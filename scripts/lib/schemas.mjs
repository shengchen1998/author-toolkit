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
const reportSchema = readSchema("report-schema-v2.json");

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(findingV1Schema, "finding-schema-v1.json");
ajv.addSchema(findingV2Schema);
ajv.addSchema(relativePathSchema);
ajv.addSchema(projectSchema);
ajv.addSchema(reportSchema);

const findingV1Validator = ajv.getSchema("finding-schema-v1.json");
const findingV2Validator = ajv.getSchema("finding-schema-v2.json");
const relativePathValidator = ajv.getSchema("relative-path-schema.json");
const projectValidator = ajv.getSchema("project-schema.json");
const reportValidator = ajv.getSchema("report-schema-v2.json");

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

export function validateReportEnvelope(value) {
  return evaluate(reportValidator, value);
}

export function validateRelativePath(value) {
  return evaluate(relativePathValidator, value);
}

export function validateSchemaDefinitions() {
  const errors = [];
  const schemas = [
    ["finding-schema.json", findingV1Schema],
    ["finding-schema-v2.json", findingV2Schema],
    ["relative-path-schema.json", relativePathSchema],
    ["project-schema.json", projectSchema],
    ["report-schema-v2.json", reportSchema],
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
