#!/usr/bin/env node

import path from "node:path";

import { scaffoldNewProject, validateRelativePath } from "./lib/index.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/scaffold-project.mjs --project-root DIR --author-project-root DIR
    [--language TAG] [--title TEXT] [--manuscript-root PATH]
    [--story-bible PATH] [--audit-tracker PATH] [--reports PATH]
    [--sessions PATH] [--backups PATH] [--handoffs PATH] [--creation PATH]
    [--created-at TIMESTAMP] [--json]

Create a new v3.1 fiction project from the sibling author-project templates.
--manuscript-root and the paths supplied to --story-bible, --audit-tracker,
--reports, --sessions, --backups, --handoffs, and --creation are relative to
--project-root and use forward slashes.
The CLI creates only missing directories and skeleton files, preserves existing
manuscript and skeleton content, and refuses an existing project manifest.
Omitted paths retain template defaults. One timestamp supplies manifest
created_at, updated_at, and the new tracker's manifest timestamp. The complete
project is validated before the command succeeds. Argument errors exit 2;
validation and filesystem failures exit 1.`);
}

function options(args) {
  const result = { json: false, paths: {} };
  const names = {
    "--project-root": "projectRoot",
    "--author-project-root": "authorProjectRoot",
    "--language": "language",
    "--title": "title",
    "--manuscript-root": "manuscriptRoot",
    "--created-at": "createdAt",
  };
  const pathNames = {
    "--story-bible": "story_bible",
    "--audit-tracker": "audit_tracker",
    "--reports": "reports",
    "--sessions": "sessions",
    "--backups": "backups",
    "--handoffs": "handoffs",
    "--creation": "creation",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      result.json = true;
    } else if ((names[argument] || pathNames[argument]) && args[index + 1]) {
      const value = args[++index];
      if (names[argument]) result[names[argument]] = value;
      else result.paths[pathNames[argument]] = value;
    } else {
      throw argumentError(`unknown or incomplete argument: ${argument}`);
    }
  }
  for (const field of ["projectRoot", "authorProjectRoot"]) {
    if (!result[field]) throw argumentError(`${field} is required`);
    result[field] = path.resolve(result[field]);
  }
  const projectPaths = [
    ["--manuscript-root", result.manuscriptRoot],
    ...Object.entries(pathNames).map(([argument, field]) => [argument, result.paths[field]]),
  ];
  for (const [argument, value] of projectPaths) {
    if (value !== undefined && !validateRelativePath(value).valid) {
      throw argumentError(`${argument} must be a portable project-relative path, e.g. manuscript`);
    }
  }
  return result;
}

function outputText(result) {
  console.log(`Manifest: ${result.manifest_path}`);
  console.log(`Language: ${result.language}`);
  console.log(`Created files: ${result.created.length}; preserved files: ${result.preserved.length}`);
  const failures = result.validation.checks.filter((check) => !check.valid);
  console.log(`Project validation: ${result.validation.checks.length} checks, ${failures.length} failures`);
  for (const check of failures) {
    console.log(`- ${check.path}`);
    for (const error of check.errors) {
      console.log(`  ${error.instancePath || "/"} ${error.message}`);
    }
  }
  console.log(`Scaffold project: ${result.valid ? "passed" : "failed"}`);
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const { json, ...selection } = options(args);
    const result = await scaffoldNewProject(selection);
    if (json) console.log(JSON.stringify(result, null, 2));
    else outputText(result);
    if (!result.valid) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
