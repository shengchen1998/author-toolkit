import { validateProjectSchema, validateProjectV3Schema } from "./schemas.mjs";
import { validateWorkflow } from "./workflow.mjs";

export function validateManifest(value) {
  if (value?.schema_version === "3.0.0") {
    return validateProjectV3Schema(value);
  }

  if (value?.schema_version !== "2.0.0") {
    return {
      valid: false,
      errors: [
        {
          instancePath: "/schema_version",
          keyword: "schema-version",
          message: `unsupported project schema_version: ${value?.schema_version ?? "missing"}`,
          params: { supported: ["2.0.0", "3.0.0"] },
        },
      ],
    };
  }

  const schemaResult = validateProjectSchema(value);
  if (!schemaResult.valid) return schemaResult;

  const workflowResult = validateWorkflow(value);
  return {
    valid: workflowResult.valid,
    errors: workflowResult.errors,
  };
}
