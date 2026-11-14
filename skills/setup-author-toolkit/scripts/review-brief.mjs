#!/usr/bin/env node

import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  generateReviewBrief,
  projectRootFromManifest,
  validateManifest,
  validateReviewBrief,
  validateTrackerV3Markdown,
} from "./lib/index.mjs";
import { withProjectWriteLock } from "./lib/write-lock.mjs";
import { validateRelativePath } from "./lib/schemas.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/review-brief.mjs [--project-root DIR] [--tracker PATH]
    [--out PATH] [--updated-at TIMESTAMP] [--json]

Regenerate the disposable review brief from the living tracker of a valid v3.1
project. The tracker defaults to paths.audit_tracker; the output defaults to
<paths.reports>/review_brief.md. Both options take portable project-relative
Markdown paths. Every resolved and dismissed row is included with its exact
location, decision reason, and current report. The complete result is validated
before an atomic replacement. Argument errors exit 2; other failures exit 1.`);
}

function options(args) {
  const result = { projectRoot: process.cwd(), json: false };
  const names = {
    "--project-root": "projectRoot",
    "--tracker": "tracker",
    "--out": "output",
    "--updated-at": "updatedAt",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") result.json = true;
    else if (names[argument] && args[index + 1] && !args[index + 1].startsWith("-")) {
      result[names[argument]] = args[++index];
    } else {
      throw argumentError(`unknown or incomplete argument: ${argument}`);
    }
  }
  result.projectRoot = path.resolve(result.projectRoot);
  if (result.updatedAt && !Number.isFinite(Date.parse(result.updatedAt))) {
    throw argumentError("--updated-at must be a valid timestamp");
  }
  return result;
}

function projectPath(projectRoot, value, label) {
  if (!validateRelativePath(value).valid || !value.endsWith(".md")) {
    throw new Error(`${label} must be a portable project-relative Markdown path`);
  }
  const target = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside the project root`);
  }
  return target;
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    selection.projectRoot = await realpath(selection.projectRoot);
    const manifestPath = path.join(selection.projectRoot, ".author-toolkit", "project.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validateManifest(manifest).valid || projectRootFromManifest(manifestPath) !== selection.projectRoot) {
      throw new Error("review brief generation requires a valid v3.1 project manifest");
    }
    const trackerPath = selection.tracker ?? manifest.paths.audit_tracker;
    const outputPath = selection.output ?? path.posix.join(manifest.paths.reports, "review_brief.md");
    if (trackerPath === outputPath) throw new Error("review brief output must not replace the tracker");
    const trackerFile = projectPath(selection.projectRoot, trackerPath, "--tracker");
    const outputFile = projectPath(selection.projectRoot, outputPath, "--out");
    const result = await withProjectWriteLock(manifestPath, manifest, async () => {
      const tracker = await readFile(trackerFile, "utf8");
      const trackerValidation = await validateTrackerV3Markdown(tracker, selection.projectRoot);
      if (!trackerValidation.valid) {
        throw new Error(trackerValidation.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
      }
      const generated = generateReviewBrief(tracker, trackerPath, selection.updatedAt);
      const validation = validateReviewBrief(generated.markdown, tracker);
      if (!validation.valid) throw new Error("generated review brief failed validation");
      await mkdir(path.dirname(outputFile), { recursive: true });
      const temporary = path.join(path.dirname(outputFile), `.${path.basename(outputFile)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, generated.markdown, { encoding: "utf8", flag: "wx" });
        if (await readFile(temporary, "utf8") !== generated.markdown) {
          throw new Error("temporary review brief verification failed");
        }
        await rename(temporary, outputFile);
        if (await readFile(outputFile, "utf8") !== generated.markdown) {
          throw new Error("published review brief verification failed");
        }
      } finally {
        await rm(temporary, { force: true });
      }
      return generated;
    });
    const summary = {
      valid: true,
      path: outputPath,
      tracker: trackerPath,
      resolved: result.resolved,
      dismissed: result.dismissed,
      updated_at: selection.updatedAt ?? result.markdown.match(/^- Updated: `([^`]+)`$/m)[1],
    };
    console.log(selection.json ? JSON.stringify(summary, null, 2) : [
      `ok - ${summary.path}`,
      `resolved: ${summary.resolved}`,
      `dismissed: ${summary.dismissed}`,
    ].join("\n"));
  }
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
