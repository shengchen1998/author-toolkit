import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { inspectProjectManifest } from "./project-inspection.mjs";
import { validateBackupIndexSchema } from "./schemas.mjs";
import { withProjectWriteLock } from "./write-lock.mjs";

function scaffoldError(message, cause) {
  const error = new Error(message, { cause });
  error.code = "ERR_PROJECT_SCAFFOLD";
  return error;
}

async function readTemplate(file) {
  const stats = await lstat(file).catch((error) => {
    throw scaffoldError(`template is missing or unreadable: ${file}: ${error.message}`, error);
  });
  if (!stats.isFile()) throw scaffoldError(`template must be a regular file: ${file}`);
  return readFile(file, "utf8");
}

async function readJsonTemplate(file) {
  const text = await readTemplate(file);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw scaffoldError(`template must be valid JSON: ${file}: ${error.message}`, error);
  }
}

function replaceRequired(text, needle, replacement, label) {
  if (text.split(needle).length !== 2) {
    throw scaffoldError(`${label} template must contain exactly one ${needle} field`);
  }
  return text.replace(needle, () => replacement);
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function assertManifestAbsent(manifestPath) {
  if (await pathExists(manifestPath)) {
    throw scaffoldError(`project manifest already exists: ${manifestPath}`);
  }
}

async function createDirectory(target) {
  if (await pathExists(target)) return;
  await mkdir(target, { recursive: true });
}

async function createFile(target, contents) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
    if (await readFile(temporary, "utf8") !== contents) {
      throw scaffoldError(`temporary scaffold verification failed: ${target}`);
    }
    await copyFile(temporary, target, constants.COPYFILE_EXCL);
    if (await readFile(target, "utf8") !== contents) {
      throw scaffoldError(`published scaffold verification failed: ${target}`);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function createMissingFile(target, contents, projectRoot, created, preserved) {
  const relative = path.relative(projectRoot, target).replaceAll(path.sep, "/");
  if (await pathExists(target)) {
    preserved.push(relative);
    return;
  }
  await createFile(target, contents);
  created.push(relative);
}

function validationErrors(result) {
  return result.errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

export async function scaffoldNewProject({
  projectRoot,
  authorProjectRoot,
  language,
  title,
  createdAt = new Date().toISOString(),
  paths = {},
  manuscriptRoot,
}) {
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await assertManifestAbsent(manifestPath);
  if (title !== undefined && /[\r\n\0]/.test(title)) {
    throw scaffoldError("project title must be a single-line string");
  }

  const assetsRoot = path.join(authorProjectRoot, "assets");
  const [projectTemplate, backupIndex, storyTemplate, trackerTemplate] = await Promise.all([
    readJsonTemplate(path.join(assetsRoot, "project-template.json")),
    readJsonTemplate(path.join(assetsRoot, "backup-index-template.json")),
    readTemplate(path.join(assetsRoot, "story-bible-template.md")),
    readTemplate(path.join(assetsRoot, "audit-tracker-template.md")),
  ]);
  const manifest = {
    ...projectTemplate,
    language: language ?? projectTemplate.language,
    manuscript_root: manuscriptRoot ?? projectTemplate.manuscript_root,
    paths: { ...projectTemplate.paths, ...paths },
    created_at: createdAt,
    updated_at: createdAt,
  };
  const manifestValidation = validateManifest(manifest);
  if (!manifestValidation.valid) {
    throw scaffoldError(`new project manifest is invalid: ${validationErrors(manifestValidation)}`);
  }
  const indexValidation = validateBackupIndexSchema(backupIndex);
  if (!indexValidation.valid) {
    throw scaffoldError(`backup index template is invalid: ${validationErrors(indexValidation)}`);
  }

  const storyBible = title === undefined
    ? storyTemplate
    : replaceRequired(storyTemplate, "- Title:", `- Title: ${title}`, "Story Bible");
  const tracker = replaceRequired(
    replaceRequired(
      trackerTemplate,
      "- Project root:",
      `- Project root: ${projectRoot}`,
      "audit tracker",
    ),
    "- Manifest created at:",
    `- Manifest created at: ${createdAt}`,
    "audit tracker",
  );
  const created = [];
  const preserved = [];
  await withProjectWriteLock(manifestPath, manifest, async () => {
    await assertManifestAbsent(manifestPath);
    await createDirectory(path.resolve(projectRoot, manifest.manuscript_root));
    for (const name of ["reports", "sessions", "backups", "handoffs", "creation"]) {
      await createDirectory(path.resolve(projectRoot, manifest.paths[name]));
    }
    await createMissingFile(
      path.resolve(projectRoot, manifest.paths.story_bible),
      storyBible,
      projectRoot,
      created,
      preserved,
    );
    await createMissingFile(
      path.resolve(projectRoot, manifest.paths.audit_tracker),
      tracker,
      projectRoot,
      created,
      preserved,
    );
    await createMissingFile(
      path.resolve(projectRoot, manifest.paths.backups, "index.json"),
      `${JSON.stringify(backupIndex, null, 2)}\n`,
      projectRoot,
      created,
      preserved,
    );
    await createFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    created.push(".author-toolkit/project.json");
  });

  const inspection = await inspectProjectManifest(manifestPath);
  return {
    valid: inspection.valid,
    manifest_path: manifestPath,
    language: manifest.language,
    manuscript_root: manifest.manuscript_root,
    paths: manifest.paths,
    created_at: manifest.created_at,
    created,
    preserved,
    validation: { valid: inspection.valid, checks: inspection.checks },
  };
}
