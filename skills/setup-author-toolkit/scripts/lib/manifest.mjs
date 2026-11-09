import { validateProjectSchema } from "./schemas.mjs";

export function validateManifest(value) {
  if (value?.schema_version !== "3.1.0") {
    return {
      valid: false,
      errors: [
        {
          instancePath: "/schema_version",
          keyword: "schema-version",
          message: `unsupported project schema_version: ${value?.schema_version ?? "missing"}`,
          params: { supported: ["3.1.0"] },
        },
      ],
    };
  }

  return validateProjectSchema(value);
}
