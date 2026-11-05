import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { root } from "./helpers.mjs";

export const timestamp = "2026-11-05T00:00:00Z";
export const authorProjectCli = path.join(root, "scripts", "author-project.mjs");

export function manifestV32() {
  return {
    schema_version: "3.2.0",
    project_type: "fiction",
    language: "en",
    manuscript_root: "manuscript",
    paths: {
      story_bible: "story-bible.md",
      audit_tracker: "audit-tracker.md",
      reports: "reports",
      sessions: "sessions",
      backups: ".author-toolkit/backups",
      handoffs: ".author-toolkit/handoffs",
      creation: ".author-toolkit/creation",
      convergence: ".author-toolkit/convergence",
    },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

export async function createConvergenceProject(t, { manuscripts = [] } = {}) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "convergence-cycle-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));

  for (const directory of [
    ".author-toolkit/convergence",
    ".author-toolkit/backups",
    ".author-toolkit/handoffs",
    ".author-toolkit/creation",
    "manuscript",
    "reports",
    "sessions",
  ]) {
    await mkdir(path.join(projectRoot, directory), { recursive: true });
  }
  await writeFile(path.join(projectRoot, "story-bible.md"), "Story\n", "utf8");
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(path.join(projectRoot, "audit-tracker.md"), tracker, "utf8");
  for (const file of manuscripts) {
    const target = path.join(projectRoot, "manuscript", file.name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
  }
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeJson(manifestPath, manifestV32());
  return { projectRoot, manifestPath };
}

export function runAuthorProject(args) {
  return spawnSync(process.execPath, [authorProjectCli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}


export function runValidator(args) {
  return spawnSync(process.execPath, [path.join(root, "scripts", "validate.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}


export async function runAuthorProjectAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [authorProjectCli, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}
