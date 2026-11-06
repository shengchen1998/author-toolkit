import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packagedReferenceUrl = globalThis[Symbol.for("author-toolkit.packaged-references")];
const packagedReferences = fileURLToPath(
  packagedReferenceUrl ??
    new URL("../../skills/setup-author-toolkit/assets/references/", import.meta.url),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function validateDeployedReferences(projectRoot) {
  const errors = [];
  const entries = await readdir(packagedReferences, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const relativePath = `.author-toolkit/references/${entry.name}`;
    const packaged = await readFile(path.join(packagedReferences, entry.name));
    let deployed;
    try {
      deployed = await readFile(path.join(projectRoot, relativePath));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      errors.push({
        instancePath: `/${relativePath}`,
        code: "shared-reference-missing",
        message: `missing shared reference ${relativePath}; run setup-author-toolkit`,
      });
      continue;
    }
    const expectedHash = sha256(packaged);
    const actualHash = sha256(deployed);
    if (actualHash !== expectedHash) {
      errors.push({
        instancePath: `/${relativePath}`,
        code: "reference-version-conflict",
        expected_sha256: expectedHash,
        actual_sha256: actualHash,
        message: `reference-version-conflict: ${relativePath}; expected_sha256=${expectedHash} actual_sha256=${actualHash}; run setup-author-toolkit`,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}
