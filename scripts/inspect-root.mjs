#!/usr/bin/env node

import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";

const candidateLimit = 12;
const languageSampleLimit = 300;
const languageSampleByteLimit = 4 * languageSampleLimit;
const manuscriptExtensions = new Set([".md", ".markdown", ".txt"]);
const componentPaths = {
  manifest: ".author-toolkit/project.json",
  manuscript: "manuscript/",
  story_bible: "story-bible.md",
  audit_tracker: "audit-tracker.md",
  reports: "reports/",
  sessions: "sessions/",
  backups: ".author-toolkit/backups/",
  handoffs: ".author-toolkit/handoffs/",
  creation: ".author-toolkit/creation/",
};
const excludedManuscriptFiles = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "START_HERE.md",
  "PROJECT_STATE.md",
  "story-bible.md",
  "audit-tracker.md",
]);
const excludedManuscriptDirectories = new Set([
  "reports",
  "sessions",
  "backups",
  "handoffs",
  "creation",
  "node_modules",
]);

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/inspect-root.mjs --project-root DIR [--language-sample] [--json]

Inspect one project root without changing it. Return entry-file types, at most
${candidateLimit} manuscript candidate paths, default component types, and recursive
regular-file counts for historical directories. Do not list historical artifact
paths, follow symlinks, or inspect shared project state. File contents remain
unread unless --language-sample is supplied. That option samples at most
${languageSampleLimit} Unicode code points with strict UTF-8 decoding only when one
unomitted manuscript candidate exists: a root file or the first direct file in
a directory.`);
}

function options(args) {
  const result = { json: false, languageSample: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--language-sample") {
      result.languageSample = true;
    } else if (args[index] === "--json") {
      result.json = true;
    } else {
      throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  if (!result.projectRoot) argumentError("--project-root DIR is required");
  return result;
}

async function entryType(absolutePath) {
  try {
    const stats = await lstat(absolutePath);
    if (stats.isFile()) return "file";
    if (stats.isDirectory()) return "directory";
    if (stats.isSymbolicLink()) return "symlink";
    return "other";
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

function isManuscriptFile(name) {
  return manuscriptExtensions.has(path.extname(name).toLowerCase());
}

async function directManuscriptFiles(absolutePath) {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isManuscriptFile(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function decodeSample(decoder, contents, options, relativePath) {
  try {
    return decoder.decode(contents, options);
  } catch {
    throw new Error(`Language sample is not valid UTF-8: ${relativePath}`);
  }
}

async function readLanguageSample(absolutePath, relativePath) {
  const file = await open(absolutePath, "r");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const buffer = Buffer.allocUnsafe(languageSampleByteLimit);
  let text = "";
  try {
    while ([...text].length < languageSampleLimit) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        text += decodeSample(decoder, undefined, undefined, relativePath);
        break;
      }
      text += decodeSample(decoder, buffer.subarray(0, bytesRead), { stream: true }, relativePath);
    }
  } finally {
    await file.close();
  }
  return [...text].slice(0, languageSampleLimit).join("");
}

async function inspectLanguageSample(projectRoot, candidates, omittedCount, filesByCandidate) {
  if (omittedCount > 0 || candidates.length > 1) return { status: "not_unique" };
  if (candidates.length === 0) return { status: "no_manuscript_file" };
  const files = filesByCandidate.get(candidates[0].path) ?? [];
  if (files.length === 0) return { status: "no_manuscript_file" };
  const relativePath = files[0];
  return {
    status: "sampled",
    path: relativePath,
    text: await readLanguageSample(path.join(projectRoot, relativePath), relativePath),
  };
}

async function countRegularFiles(absolutePath) {
  if (await entryType(absolutePath) !== "directory") return null;
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const counts = await Promise.all(entries.map(async (entry) => {
    if (entry.isFile()) return 1;
    if (entry.isDirectory()) return countRegularFiles(path.join(absolutePath, entry.name));
    return 0;
  }));
  return counts.reduce((total, count) => total + count, 0);
}

async function inspectRoot(projectRoot, includeLanguageSample) {
  if (await entryType(projectRoot) !== "directory") {
    throw new Error("--project-root must name an accessible directory");
  }
  const rootEntries = await readdir(projectRoot, { withFileTypes: true });
  const manuscriptCandidates = [];
  const filesByCandidate = new Map();
  for (const name of rootEntries
    .filter((entry) => entry.isFile()
      && isManuscriptFile(entry.name)
      && !excludedManuscriptFiles.has(entry.name))
    .map((entry) => entry.name)
    .sort()) {
    manuscriptCandidates.push({ path: name, type: "file" });
    filesByCandidate.set(name, [name]);
  }

  const directories = rootEntries
    .filter((entry) => entry.isDirectory()
      && !entry.name.startsWith(".")
      && !excludedManuscriptDirectories.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  for (const name of directories) {
    const files = await directManuscriptFiles(path.join(projectRoot, name));
    if (name === "manuscript" || files.length > 0) {
      const candidatePath = `${name}/`;
      manuscriptCandidates.push({
        path: candidatePath,
        type: "directory",
        direct_manuscript_files: files.length,
      });
      filesByCandidate.set(candidatePath, files.map((file) => `${name}/${file}`));
    }
  }
  manuscriptCandidates.sort((left, right) => left.path.localeCompare(right.path));

  const entries = {};
  for (const name of ["AGENTS.md", "CLAUDE.md", "START_HERE.md"]) {
    entries[name] = await entryType(path.join(projectRoot, name));
  }
  const components = {};
  for (const [name, relativePath] of Object.entries(componentPaths)) {
    components[name] = {
      path: relativePath,
      type: await entryType(path.join(projectRoot, relativePath)),
    };
  }
  const history = {};
  for (const name of ["reports", "sessions", "backups", "handoffs", "creation"]) {
    const relativePath = componentPaths[name];
    history[relativePath] = await countRegularFiles(path.join(projectRoot, relativePath));
  }

  const result = {
    entries,
    manuscript_candidates: manuscriptCandidates.slice(0, candidateLimit),
    omitted_manuscript_candidates: Math.max(0, manuscriptCandidates.length - candidateLimit),
    components,
    historical_file_counts: history,
  };
  if (includeLanguageSample) {
    result.language_sample = await inspectLanguageSample(
      projectRoot,
      result.manuscript_candidates,
      result.omitted_manuscript_candidates,
      filesByCandidate,
    );
  }
  return result;
}

function outputText(result) {
  for (const [name, type] of Object.entries(result.entries)) {
    console.log(`Entry ${name}: ${type}`);
  }
  console.log(`Manuscript candidates: ${result.manuscript_candidates.length}; omitted: ${result.omitted_manuscript_candidates}`);
  for (const candidate of result.manuscript_candidates) {
    console.log(`- ${candidate.path} (${candidate.type})`);
  }
  for (const [name, component] of Object.entries(result.components)) {
    console.log(`Component ${name}: ${component.type} (${component.path})`);
  }
  for (const [relativePath, count] of Object.entries(result.historical_file_counts)) {
    console.log(`Historical files ${relativePath}: ${count ?? "not a directory"}`);
  }
  if (result.language_sample) {
    console.log(`Language sample: ${result.language_sample.status}`);
    if (result.language_sample.status === "sampled") {
      console.log(`Language sample file: ${result.language_sample.path}`);
      console.log(result.language_sample.text);
    }
  }
}

const args = process.argv.slice(2);
try {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const result = await inspectRoot(selection.projectRoot, selection.languageSample);
    if (selection.json) console.log(JSON.stringify(result, null, 2));
    else outputText(result);
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
