import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

const PAYLOAD_MANIFEST = "assets/payload-manifest.json";
const REQUIRED_SIBLINGS = {
  "author-project": [
    "SKILL.md",
    "references/operations.md",
    "references/read-operations.md",
    "assets/project-template.json",
    "assets/backup-index-template.json",
    "assets/story-bible-template.md",
    "assets/audit-tracker-template.md",
  ],
  "revise-draft": [
    "references/stage-gates.md",
    "assets/draft-baseline-template.md",
    "assets/intake-report-template.md",
  ],
  "revise-fiction": [
    "references/state-and-findings.md",
    "assets/revision-plan-template.md",
  ],
};

export function requiredSiblingNames() {
  return Object.keys(REQUIRED_SIBLINGS);
}

export function resolveSetupRoot(scriptRoot) {
  return existsSync(path.join(scriptRoot, PAYLOAD_MANIFEST))
    ? scriptRoot
    : path.join(scriptRoot, "skills", "setup-author-toolkit");
}

function portablePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith("/") &&
    !/^[A-Za-z]:/.test(value) &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !/^[A-Za-z][A-Za-z\d+.-]*:/.test(value) &&
    value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function validateManifestShape(value) {
  const errors = [];
  const keys = value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).sort()
    : [];
  if (JSON.stringify(keys) !== JSON.stringify(["files", "schema_version", "version"])) {
    errors.push("payload manifest must contain only schema_version, version, and files");
  }
  if (value?.schema_version !== "1.1") {
    errors.push("payload manifest schema_version must be 1.1");
  }
  if (
    typeof value?.version !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value.version)
  ) {
    errors.push("payload manifest version must be a semantic version");
  }
  if (!Array.isArray(value?.files) || value.files.length === 0) {
    errors.push("payload manifest files must be a non-empty array");
    return errors;
  }
  const paths = new Set();
  for (const [index, entry] of value.files.entries()) {
    const label = `files[${index}]`;
    const entryKeys = entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.keys(entry).sort()
      : [];
    if (JSON.stringify(entryKeys) !== JSON.stringify(["path", "sha256"])) {
      errors.push(`${label} must contain only path and sha256`);
      continue;
    }
    if (!portablePath(entry?.path) || entry.path === PAYLOAD_MANIFEST) {
      errors.push(`${label}.path must be a portable payload-relative file path`);
    } else if (paths.has(entry.path)) {
      errors.push(`${label}.path duplicates ${entry.path}`);
    } else {
      paths.add(entry.path);
    }
    if (!/^[a-f\d]{64}$/.test(entry?.sha256)) {
      errors.push(`${label}.sha256 must be a lowercase SHA-256 hash`);
    }
  }
  return errors;
}

async function readPayloadManifest(setupRoot) {
  const relative = PAYLOAD_MANIFEST;
  let text;
  try {
    const stats = await lstat(path.join(setupRoot, relative));
    if (!stats.isFile()) throw new Error("not a regular file");
    text = await readFile(path.join(setupRoot, relative), "utf8");
  } catch (error) {
    return { failures: [{ path: relative, reason: `missing or unreadable: ${error.message}` }] };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { failures: [{ path: relative, reason: `invalid JSON: ${error.message}` }] };
  }
  const errors = validateManifestShape(value);
  if (errors.length > 0) {
    return { failures: errors.map((reason) => ({ path: relative, reason })) };
  }
  return { manifest: value, failures: [] };
}

export async function inspectSetupPayload(setupRoot, { projectRoot, requireSiblings = [] } = {}) {
  const { manifest, failures } = await readPayloadManifest(setupRoot);
  let references = 0;
  let clis = 0;
  const checkedPaths = new Set();
  for (const entry of manifest?.files ?? []) {
    if (checkedPaths.has(entry.path)) continue;
    checkedPaths.add(entry.path);
    if (entry.path.startsWith("assets/references/")) references += 1;
    if (
      entry.path.startsWith("scripts/") &&
      entry.path.endsWith(".mjs") &&
      !entry.path.slice("scripts/".length).includes("/")
    ) {
      clis += 1;
    }
    try {
      const stats = await lstat(path.join(setupRoot, entry.path));
      if (!stats.isFile()) {
        failures.push({ path: entry.path, reason: "not a regular file" });
        continue;
      }
      const contents = await readFile(path.join(setupRoot, entry.path));
      const actual = createHash("sha256").update(contents).digest("hex");
      if (actual !== entry.sha256) {
        failures.push({ path: entry.path, reason: "SHA-256 differs from payload manifest" });
      }
    } catch (error) {
      failures.push({ path: entry.path, reason: `missing or unreadable: ${error.message}` });
    }
  }

  const siblings = [];
  for (const name of new Set(requireSiblings)) {
    const requiredFiles = REQUIRED_SIBLINGS[name];
    if (!requiredFiles) throw new Error(`Unsupported required sibling: ${name}`);
    siblings.push({ name, files: requiredFiles.length });
    for (const relative of requiredFiles) {
      try {
        const stats = await lstat(path.join(setupRoot, "..", name, relative));
        if (!stats.isFile()) throw new Error("not a regular file");
      } catch (error) {
        failures.push({
          path: `sibling:${name}/${relative}`,
          reason: `missing or unreadable: ${error.message}`,
        });
      }
    }
  }

  const sibling = {
    checked: siblings.length > 0,
    name: siblings[0]?.name ?? null,
    files: siblings[0]?.files ?? 0,
  };

  const project = { checked: false, agents: null, claude: null };
  if (projectRoot !== undefined) {
    project.checked = true;
    const template = manifest?.files.find((entry) => entry.path === "assets/AGENTS.md");
    if (template && !failures.some((failure) => failure.path === template.path)) {
      try {
        const [expected, actual, stats] = await Promise.all([
          readFile(path.join(setupRoot, template.path)),
          readFile(path.join(projectRoot, "AGENTS.md")),
          lstat(path.join(projectRoot, "AGENTS.md")),
        ]);
        project.agents = stats.isFile() && expected.equals(actual)
          ? "ok"
          : "different from installed template";
      } catch (error) {
        project.agents = `missing or unreadable: ${error.message}`;
      }
      if (project.agents !== "ok") {
        failures.push({ path: "project:AGENTS.md", reason: project.agents });
      }
    } else {
      project.agents = "not checked: installed template is unavailable";
      failures.push({ path: "project:AGENTS.md", reason: project.agents });
    }

    try {
      const target = path.join(projectRoot, "CLAUDE.md");
      const stats = await lstat(target);
      if (!stats.isSymbolicLink()) {
        project.claude = "not a symbolic link";
      } else {
        const link = await readlink(target);
        project.claude = link === "AGENTS.md" ? "ok" : `link target is ${link}`;
      }
    } catch (error) {
      project.claude = `missing or unreadable: ${error.message}`;
    }
    if (project.claude !== "ok") {
      failures.push({ path: "project:CLAUDE.md", reason: project.claude });
    }
  }
  return {
    valid: failures.length === 0,
    setup_root: setupRoot,
    payload_manifest: manifest ? path.basename(PAYLOAD_MANIFEST) : null,
    version: manifest?.version ?? null,
    files: manifest?.files.length ?? 0,
    references,
    clis,
    sibling,
    siblings,
    project,
    failures,
    payload_failures: failures.filter((failure) =>
      !failure.path.startsWith("project:") && !failure.path.startsWith("sibling:")),
    sibling_failures: failures.filter((failure) => failure.path.startsWith("sibling:")),
    entry_failures: failures.filter((failure) => failure.path.startsWith("project:")),
  };
}
