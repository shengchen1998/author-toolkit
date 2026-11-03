import { validateProjectSchema } from "./schemas.mjs";
import { validateWorkflow } from "./workflow.mjs";

export function validateManifest(value) {
  const schemaResult = validateProjectSchema(value);
  if (!schemaResult.valid) return schemaResult;

  const workflowResult = validateWorkflow(value);
  return {
    valid: workflowResult.valid,
    errors: workflowResult.errors,
  };
}
