#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateCoverageIndex,
  validateCoverageUnit,
  validateCreationBatch,
  validateCreationCommit,
  validateEvidenceReport,
  validateExecutionReceipts,
  validateManifest,
  validateMarkdownReport,
  validateProjectFiles,
  validateReaderState,
  validateReaderStateMarkdown,
  validateReviewJob,
  validateReviewBrief,
  validateSchemaDefinitions,
  validateScopeCurrency,
  reportFindingIdentities,
  validateFindingBatch,
  validateStoryState,
  validateStoryStateMarkdown,
  projectRootFromManifest,
  validateTracker,
} from "./lib/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const examples = ["fiction-revision-en", "fiction-revision-zh"];
const artifactTypes = [
  { key: "creationBatches", option: "--creation-batch", validate: validateCreationBatch },
  { key: "creationCommits", option: "--creation-commit", validate: validateCreationCommit },
  { key: "coverageUnits", option: "--coverage-unit", validate: validateCoverageUnit },
  { key: "coverageIndexes", option: "--coverage-index", validate: validateCoverageIndex },
  { key: "reviewJobs", option: "--review-job", validate: validateReviewJob },
  {
    key: "reviewBriefs",
    option: "--review-brief",
    validate: validateReviewBrief,
    validateMarkdown: validateReviewBrief,
  },
  {
    key: "readerStates",
    option: "--reader-state",
    validate: validateReaderState,
    validateMarkdown: validateReaderStateMarkdown,
  },
  {
    key: "storyStates",
    option: "--story-state",
    validate: validateStoryState,
    validateMarkdown: validateStoryStateMarkdown,
  },
];

function usage() {
  console.log(`Usage:
  node scripts/validate.mjs
  node scripts/validate.mjs [--manifest FILE] [--report FILE] [--tracker FILE]...
  node scripts/validate.mjs [--creation-batch FILE] [--creation-commit FILE]...
  node scripts/validate.mjs [--coverage-unit FILE] [--coverage-index FILE]...
  node scripts/validate.mjs [--review-job FILE] [--review-brief FILE --tracker FILE] [--reader-state FILE] [--story-state FILE]...

With no options, all schemas, example manifests, and reports are checked.`);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(target)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files.sort();
}

function parseArguments(args) {
  const selection = {
    manifests: [],
    reports: [],
    trackers: [],
    ...Object.fromEntries(artifactTypes.map(({ key }) => [key, []])),
    help: false,
  };
  const destinations = {
    "--manifest": "manifests",
    "--report": "reports",
    "--tracker": "trackers",
    ...Object.fromEntries(artifactTypes.map(({ key, option }) => [option, key])),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      selection.help = true;
      continue;
    }
    const destination = destinations[argument];
    if (!destination || !args[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    selection[destination].push(path.resolve(args[index + 1]));
    index += 1;
  }
  return selection;
}

async function main() {
  const selection = parseArguments(process.argv.slice(2));
  if (selection.help) {
    usage();
    return;
  }
  if (
    selection.trackers.length > 1 ||
    (selection.reviewBriefs.length > 0 && selection.trackers.length !== 1) ||
    (selection.reviewBriefs.length === 0 && selection.reports.length === 0 && selection.trackers.length > 0)
  ) {
    throw new Error("--tracker requires --review-brief or --report");
  }

  const useDefaults = Object.entries(selection).every(
    ([key, files]) => key === "help" || files.length === 0,
  );

  let checks = 0;
  let failures = 0;

  function check(label, result) {
    checks += 1;
    if (result.valid) {
      console.log(`ok - ${label}`);
      return;
    }
    failures += 1;
    console.error(`not ok - ${label}`);
    for (const error of result.errors) {
      console.error(`  ${error.instancePath || "/"} ${error.message}`);
    }
  }

  if (useDefaults) {
    check("JSON Schema definitions", validateSchemaDefinitions());
    for (const example of examples) {
      const directory = path.join(root, "examples", example);
      selection.manifests.push(path.join(directory, ".author-toolkit", "project.json"));
      selection.reports.push(...(await markdownFiles(path.join(directory, "reports"))));
    }
  }

  for (const file of selection.manifests) {
    try {
      const manifest = await readJson(file);
      const result = validateManifest(manifest);
      check(path.relative(root, file), result);

      if (result.valid) {
        check(`${path.relative(root, file)}#files`, await validateProjectFiles(manifest, file));
        if (manifest.current_scope) {
          check(`${path.relative(root, file)}#scope`, await validateScopeCurrency(manifest, file));
        }
        const trackerResult = await validateTracker(manifest, file);
        check(`${path.relative(root, file)}#tracker`, trackerResult);
        if (trackerResult.valid) {
          check(`${path.relative(root, file)}#executions`, await validateExecutionReceipts(manifest, file));
        }
      } else if (manifest?.schema_version !== "3.1.0" || manifest?.project_type !== "fiction") {
        console.error(
          "  unsupported project detected; only v3.1 fiction manifests are supported",
        );
      }
    } catch (error) {
      check(path.relative(root, file), {
        valid: false,
        errors: [{ instancePath: "", message: error.message }],
      });
    }
  }

  const reportInputs = [];
  for (const file of selection.reports) {
    try {
      const markdown = await readFile(file, "utf8");
      const parsed = validateMarkdownReport(markdown);
      const needsEvidence = ["draft-baseline", "diagnostics", "current-scope-review"].includes(
        parsed.envelope?.stage,
      );
      check(path.relative(root, file), needsEvidence ? validateEvidenceReport(markdown) : parsed);
      if (parsed.envelope) reportInputs.push({ path: file, envelope: parsed.envelope });
    } catch (error) {
      check(path.relative(root, file), {
        valid: false,
        errors: [{ instancePath: "", message: error.message }],
      });
    }
  }

  if (!useDefaults && reportInputs.length > 0 && (reportInputs.length > 1 || selection.manifests.length > 0 || selection.trackers.length > 0)) {
    const identityReports = selection.manifests.length === 1
      ? reportInputs.filter((report) => {
        const relative = path.relative(projectRootFromManifest(selection.manifests[0]), report.path);
        return relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
      })
      : reportInputs;
    if (identityReports.length !== reportInputs.length || (!useDefaults && selection.manifests.length > 1 && selection.reports.length > 0)) {
      throw new Error("finding identity checks require reports from exactly one selected manifest project");
    }
    try {
      let tracker = "";
      if (selection.trackers.length === 1) {
        tracker = await readFile(selection.trackers[0], "utf8");
      } else if (selection.manifests.length === 1) {
        const manifestFile = selection.manifests[0];
        const manifest = await readJson(manifestFile);
        const projectRoot = projectRootFromManifest(manifestFile);
        tracker = await readFile(path.resolve(projectRoot, manifest.paths.audit_tracker), "utf8");
      }
      const history = [];
      if (selection.manifests.length === 1) {
        const manifestFile = selection.manifests[0];
        const manifest = await readJson(manifestFile);
        const projectRoot = projectRootFromManifest(manifestFile);
        history.push(...await reportFindingIdentities(projectRoot, manifest.paths.reports));
        for (const report of reportInputs) {
          report.path = path.relative(projectRoot, report.path).replaceAll(path.sep, "/");
        }
      }
      const result = validateFindingBatch(identityReports, tracker, history);
      for (const file of selection.reports) {
        const reportPath = selection.manifests.length === 1
          ? path.relative(projectRootFromManifest(selection.manifests[0]), file).replaceAll(path.sep, "/")
          : file;
        const errors = result.errors.filter((error) => error.report === reportPath);
        check(`${path.relative(root, file)}#finding-identity`, { valid: errors.length === 0, errors });
      }
    } catch (error) {
      check("finding identity", { valid: false, errors: [{ instancePath: "", message: error.message }] });
    }
  }

  for (const type of artifactTypes) {
    for (const file of selection[type.key]) {
      try {
        const isMarkdown = type.validateMarkdown && /\.(?:md|markdown)$/i.test(file);
        const result = isMarkdown
          ? type.validateMarkdown(
              await readFile(file, "utf8"),
              ...(type.key === "reviewBriefs" ? [await readFile(selection.trackers[0], "utf8")] : []),
            )
          : type.validate(await readJson(file));
        check(path.relative(root, file), result);
      } catch (error) {
        check(path.relative(root, file), {
          valid: false,
          errors: [{ instancePath: "", message: error.message }],
        });
      }
    }
  }

  console.log(`${checks} checks, ${failures} failures`);
  if (failures > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = 2;
}
