#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const examples = ["fiction-revision-en", "fiction-revision-zh"];

function createArtifactTypes({
  validateConvergenceCycle,
  validateConvergenceEvaluation,
  validateNoEditSkip,
  validateRequestedPass,
  validateReviewGroup,
  validateRevisionExecution,
  validateSemanticAttestation,
  validateCoverageIndex,
  validateCoverageUnit,
  validateCreationBatch,
  validateCreationCommit,
  validateInventorySnapshot,
  validateManuscriptReconciliationSchema,
  validateReaderState,
  validateReaderStateMarkdown,
  validateReviewJob,
  validateScopeSnapshot,
  validateStoryState,
  validateStoryStateMarkdown,
}) {
  return [
    { key: "scopeSnapshots", option: "--scope-snapshot", validate: validateScopeSnapshot },
    {
      key: "inventorySnapshots",
      option: "--inventory-snapshot",
      validate: validateInventorySnapshot,
    },
    {
      key: "convergenceCycles",
      option: "--convergence-cycle",
      validate: validateConvergenceCycle,
    },
    { key: "requestedPasses", option: "--requested-pass", validate: validateRequestedPass },
    {
      key: "revisionExecutions",
      option: "--revision-execution",
      validate: validateRevisionExecution,
    },
    {
      key: "manuscriptReconciliations",
      option: "--manuscript-reconciliation",
      validate: validateManuscriptReconciliationSchema,
    },
    { key: "noEditSkips", option: "--no-edit-skip", validate: validateNoEditSkip },
    { key: "reviewGroups", option: "--review-group", validate: validateReviewGroup },
    {
      key: "semanticAttestations",
      option: "--semantic-attestation",
      validate: validateSemanticAttestation,
    },
    {
      key: "convergenceEvaluations",
      option: "--convergence-evaluation",
      validate: validateConvergenceEvaluation,
    },
    { key: "creationBatches", option: "--creation-batch", validate: validateCreationBatch },
    { key: "creationCommits", option: "--creation-commit", validate: validateCreationCommit },
    { key: "coverageUnits", option: "--coverage-unit", validate: validateCoverageUnit },
    { key: "coverageIndexes", option: "--coverage-index", validate: validateCoverageIndex },
    { key: "reviewJobs", option: "--review-job", validate: validateReviewJob },
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
}

function usage() {
  console.log(`Usage:
  node ${process.argv[1] ?? "validate.mjs"}
  node ${process.argv[1] ?? "validate.mjs"} --repository
  node ${process.argv[1] ?? "validate.mjs"} --project-root ROOT
  node ${process.argv[1] ?? "validate.mjs"} [--manifest FILE] [--report FILE] [--workflow-fixture FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--scope-snapshot FILE] [--inventory-snapshot FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--convergence-cycle FILE] [--requested-pass FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--revision-execution FILE] [--manuscript-reconciliation FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--no-edit-skip FILE] [--review-group FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--semantic-attestation FILE] [--convergence-evaluation FILE]...
  node ${process.argv[1] ?? "validate.mjs"} --convergence-status MANIFEST
  node ${process.argv[1] ?? "validate.mjs"} --convergence-gate MANIFEST
  node ${process.argv[1] ?? "validate.mjs"} [--creation-batch FILE] [--creation-commit FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--coverage-unit FILE] [--coverage-index FILE]...
  node ${process.argv[1] ?? "validate.mjs"} [--review-job FILE] [--reader-state FILE] [--story-state FILE]...

With no options, print this help without inspecting state.
Repository mode checks all schemas, example manifests, reports, and workflow fixtures.
Project-root mode checks deployed shared-reference hashes, then the selected project's manifest, files, and tracker.
Repository and project-root modes cannot be combined with each other or individual checks.
--now ISO_TIMESTAMP injects the UTC validation clock; current timestamps may be at most 60 seconds in the future.`);
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

function parseArguments(args, artifactTypes) {
  const selection = {
    manifests: [],
    reports: [],
    workflowFixtures: [],
    convergenceStatus: [],
    convergenceGate: [],
    ...Object.fromEntries(artifactTypes.map(({ key }) => [key, []])),
    repository: false,
    projectRoot: null,
    now: null,
    help: args.length === 0,
  };
  const destinations = {
    "--manifest": "manifests",
    "--report": "reports",
    "--workflow-fixture": "workflowFixtures",
    "--convergence-status": "convergenceStatus",
    "--convergence-gate": "convergenceGate",
    ...Object.fromEntries(artifactTypes.map(({ key, option }) => [option, key])),
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      selection.help = true;
      continue;
    }
    if (argument === "--repository") {
      selection.repository = true;
      continue;
    }
    if (argument === "--project-root" && args[index + 1]) {
      selection.projectRoot = path.resolve(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--now" && args[index + 1]) {
      if (selection.now !== null) throw new Error("Repeated argument: --now");
      selection.now = args[index + 1];
      index += 1;
      continue;
    }
    const destination = destinations[argument];
    if (!destination || !args[index + 1]) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    selection[destination].push(path.resolve(args[index + 1]));
    index += 1;
  }
  const individualChecks = Object.values(selection).reduce(
    (count, value) => count + (Array.isArray(value) ? value.length : 0),
    0,
  );
  if (
    (selection.repository && selection.projectRoot) ||
    ((selection.repository || selection.projectRoot) && individualChecks > 0)
  ) {
    throw new Error(
      "Repository and project-root modes cannot be combined with each other or individual checks",
    );
  }
  return selection;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }
  const [runtime, { V3_SCHEMA_VERSIONS }, { validateDeployedReferences }] = await Promise.all([
    import("./lib/index.mjs"),
    import("./lib/constants.mjs"),
    import("./lib/shared-references.mjs"),
  ]);
  const {
    checkConvergenceGate,
    getCycleStatus,
    projectRootFromManifest,
    validateEvidenceReport,
    validateFullManuscriptScope,
    validateManifest,
    validateMarkdownReport,
    validateProjectFiles,
    validateSchemaDefinitions,
    validateScopeCurrency,
    validateTracker,
    validateWorkflowSequence,
  } = runtime;
  const artifactTypes = createArtifactTypes(runtime);
  const selection = parseArguments(args, artifactTypes);
  const queryRequested = selection.convergenceStatus.length > 0 || selection.convergenceGate.length > 0;
  if (queryRequested) {
    const selectedCount = Object.values(selection).reduce(
      (count, value) => count + (Array.isArray(value) ? value.length : 0),
      0,
    );
    if (selectedCount !== 1) {
      throw new Error("A convergence query cannot be repeated or combined with other checks");
    }
    const isStatus = selection.convergenceStatus.length === 1;
    const manifestPath = isStatus ? selection.convergenceStatus[0] : selection.convergenceGate[0];
    const projectRoot = projectRootFromManifest(manifestPath);
    const result = isStatus
      ? await getCycleStatus(projectRoot)
      : await checkConvergenceGate(projectRoot);
    console.log(JSON.stringify(result, null, 2));
    if (isStatus ? !result.query_valid : !result.valid) process.exitCode = 1;
    return;
  }

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

  if (selection.projectRoot) {
    const references = await validateDeployedReferences(selection.projectRoot);
    check(".author-toolkit/references", references);
    if (references.valid) {
      selection.manifests.push(
        path.join(selection.projectRoot, ".author-toolkit", "project.json"),
      );
    }
  }

  if (selection.repository) {
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
      const result = validateManifest(manifest, { now: selection.now ?? undefined });
      check(path.relative(root, file), result);

      if (result.valid) {
        check(`${path.relative(root, file)}#files`, await validateProjectFiles(manifest, file));
        if (V3_SCHEMA_VERSIONS.has(manifest.schema_version) && manifest.current_scope) {
          const scopeResult =
            manifest.schema_version === "3.2.0"
              ? await validateFullManuscriptScope(manifest, file)
              : await validateScopeCurrency(manifest, file);
          check(`${path.relative(root, file)}#scope`, scopeResult);
          if (manifest.schema_version === "3.2.0") {
            console.log(
              `  scope_id=${scopeResult.scope_id} scope_fingerprint=${scopeResult.scope_fingerprint} full_manuscript=${scopeResult.full_manuscript}`,
            );
          }
        }
        check(`${path.relative(root, file)}#tracker`, await validateTracker(manifest, file));
      } else if (
        !["2.0.0", "3.0.0", "3.1.0", "3.2.0"].includes(manifest?.schema_version) ||
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
      const options = { now: selection.now ?? undefined };
      const parsed = validateMarkdownReport(markdown, options);
      const needsEvidence = ["draft-baseline", "diagnostics", "current-scope-review"].includes(
        parsed.envelope?.stage,
      );
      check(
        path.relative(root, file),
        needsEvidence ? validateEvidenceReport(markdown, options) : parsed,
      );
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

  for (const type of artifactTypes) {
    for (const file of selection[type.key]) {
      try {
        const isMarkdown = type.validateMarkdown && /\.(?:md|markdown)$/i.test(file);
        const options = { now: selection.now ?? undefined };
        const result = isMarkdown
          ? type.validateMarkdown(await readFile(file, "utf8"), options)
          : type.validate(await readJson(file), options);
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
