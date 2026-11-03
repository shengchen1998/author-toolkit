#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateEvidenceReport,
  validateManifest,
  validateMarkdownReport,
  validateProjectFiles,
  validateSchemaDefinitions,
  validateScopeCurrency,
  validateTracker,
  validateWorkflowSequence,
} from "./lib/index.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const examples = ["fiction-revision-en", "fiction-revision-zh"];

function usage() {
  console.log(`Usage:
  node scripts/validate.mjs
  node scripts/validate.mjs [--manifest FILE] [--report FILE] [--workflow-fixture FILE]...

With no options, all schemas, example manifests, reports, and workflow fixtures are checked.`);
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
  const selection = { manifests: [], reports: [], workflowFixtures: [], help: false };
  const destinations = {
    "--manifest": "manifests",
    "--report": "reports",
    "--workflow-fixture": "workflowFixtures",
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

  const useDefaults =
    selection.manifests.length === 0 &&
    selection.reports.length === 0 &&
    selection.workflowFixtures.length === 0;

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
      const sessions = await readdir(path.join(directory, "sessions"));
      selection.workflowFixtures.push(
        ...sessions
          .filter((file) => file.endsWith(".fixture.json"))
          .map((file) => path.join(directory, "sessions", file)),
      );
    }
  }

  for (const file of selection.manifests) {
    try {
      const manifest = await readJson(file);
      const result = validateManifest(manifest);
      check(path.relative(root, file), result);

      if (result.valid) {
        check(`${path.relative(root, file)}#files`, await validateProjectFiles(manifest, file));
        if (manifest.schema_version === "3.0.0" && manifest.current_scope) {
          check(`${path.relative(root, file)}#scope`, await validateScopeCurrency(manifest, file));
        }
        check(`${path.relative(root, file)}#tracker`, await validateTracker(manifest, file));
      } else if (
        !["2.0.0", "3.0.0"].includes(manifest?.schema_version) ||
        manifest?.project_type !== "fiction" ||
        (manifest?.schema_version === "2.0.0" &&
          manifest?.workflow?.name !== "revise-fiction")
      ) {
        console.error(
          "  legacy or standalone project detected; run setup-author-toolkit to register or migrate it before revision",
        );
      }
    } catch (error) {
      check(path.relative(root, file), {
        valid: false,
        errors: [{ instancePath: "", message: error.message }],
      });
    }
  }

  for (const file of selection.reports) {
    try {
      const markdown = await readFile(file, "utf8");
      const parsed = validateMarkdownReport(markdown);
      const needsEvidence = ["draft-baseline", "diagnostics", "current-scope-review"].includes(
        parsed.envelope?.stage,
      );
      check(path.relative(root, file), needsEvidence ? validateEvidenceReport(markdown) : parsed);
    } catch (error) {
      check(path.relative(root, file), {
        valid: false,
        errors: [{ instancePath: "", message: error.message }],
      });
    }
  }

  for (const file of selection.workflowFixtures) {
    try {
      const fixture = await readJson(file);
      if (fixture.fixture !== true || !Array.isArray(fixture.snapshots) || !fixture.project) {
        throw new Error("Workflow fixture requires fixture=true, project, and snapshots");
      }
      const base = await readJson(path.resolve(path.dirname(file), fixture.project));
      const projects = fixture.snapshots.map((snapshot) => {
        if (!snapshot.label || !snapshot.paths || !snapshot.workflow || !snapshot.updated_at) {
          throw new Error(
            "Every workflow snapshot requires label, paths, updated_at, and workflow",
          );
        }
        return {
          ...base,
          paths: snapshot.paths,
          updated_at: snapshot.updated_at,
          workflow: snapshot.workflow,
        };
      });

      projects.forEach((project, index) => {
        check(
          `${path.relative(root, file)}#${fixture.snapshots[index].label}`,
          validateManifest(project),
        );
      });
      check(`${path.relative(root, file)}#sequence`, validateWorkflowSequence(projects));
    } catch (error) {
      check(path.relative(root, file), {
        valid: false,
        errors: [{ instancePath: "", message: error.message }],
      });
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
