import { validateProjectV4Schema } from "./schemas.mjs";

export const CURRENT_PROJECT_SCHEMA_VERSION = "4.0.0";

export function greenfieldInitializationError(value) {
  const detected = value?.schema_version ?? "missing";
  return {
    code: "greenfield-initialization-required",
    instancePath: "/schema_version",
    keyword: "schema-version",
    message: `Unsupported project schema_version: ${detected}. Author Toolkit 4.0.0 supports only the 4.0.0 project contract. Create a new project from manuscript-only input and run setup-author-toolkit there; preserve the old project and do not copy its manifest, references, findings, approvals, evaluations, or other shared state. No migration or old shared-state import is available.`,
    params: { supported: [CURRENT_PROJECT_SCHEMA_VERSION], detected },
    required_action: {
      strategy: "setup-author-toolkit",
      operation: "initialize-manuscript-only-project",
      command: "setup-author-toolkit",
      manuscript_only: true,
      preserve_existing_project: true,
    },
  };
}

export function validateManifest(value, options = {}) {
  if (value?.schema_version === CURRENT_PROJECT_SCHEMA_VERSION) {
    return validateProjectV4Schema(value, options);
  }
  return { valid: false, errors: [greenfieldInitializationError(value)] };
}
