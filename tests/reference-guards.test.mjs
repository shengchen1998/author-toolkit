import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { recordScope } from "../scripts/lib/index.mjs";
import {
  authorProjectCli,
  createConvergenceProject,
  createNoEditEvidence,
  createRevisionExecutionFixture,
  timestamp,
  writeJson,
} from "./convergence-helpers.mjs";
import { root } from "./helpers.mjs";

const validatorCli = path.join(root, "scripts", "validate.mjs");
const manuscript = "The ferry leaves at dawn.\n";
const manuscriptFile = {
  path: "manuscript/chapter-001.md",
  sha256: createHash("sha256").update(manuscript).digest("hex"),
};
const commands = [
  "read",
  "status",
  "set-pending",
  "record-scope",
  "record-finding",
  "record-finding-decision",
  "record-approval",
  "record-backup",
  "record-restore",
  "start-cycle",
  "transition-cycle",
  "reconcile-cycle",
  "reconcile-manuscript",
  "check-operation",
  "prepare-draft-revision-execution",
  "prepare-revision-execution",
  "verify-draft-revision-execution",
  "verify-revision-execution",
  "evaluate-cycle",
  "evaluate-draft",
  "complete-cycle",
  "cycle-status",
  "cycle-gate",
  "convergence-status",
  "convergence-gate",
];

function runProject(projectRoot, command, input) {
  const args = [authorProjectCli, command, "--project-root", projectRoot];
  if (input !== undefined && input !== null) args.push("--input", input);
  return spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "" },
  });
}

async function validInput(command, projectRoot, context) {
  if (["read", "status", "reconcile-cycle", "cycle-status", "cycle-gate", "convergence-status", "convergence-gate"].includes(command)) {
    return null;
  }
  if (command === "start-cycle") {
    return {
      cycle_id: "cycle-reference-guard",
      initiating_strategy: "write-fiction",
      bootstrap: true,
      starting_scope: null,
    };
  }
  if (command === "transition-cycle") {
    return {
      cycle_id: "cycle-reference-guard",
      expected_revision: 1,
      current_strategy: "revise-draft",
      recovery_position: { operation: "intake", reason: "Reference guard fixture." },
    };
  }
  if (command === "check-operation") {
    return {
      cycle_id: "cycle-reference-guard",
      strategy: "revise-draft",
      operation: "intake",
      manuscript_change: false,
    };
  }
  if (command === "reconcile-manuscript") {
    return {
      reconciliation_id: "reconciliation-reference-guard",
      previous_scope: null,
      author_decision_id: "IMPORT-001",
      target_scope: null,
      story_state: [{ path: ".author-toolkit/creation/state/current.md", sha256: "0".repeat(64) }],
    };
  }
  if (command === "complete-cycle") {
    return {
      cycle_id: "cycle-reference-guard",
      expected_revision: 1,
      evaluation_id: "evaluation-reference-guard",
      decision_id: "COMPLETE-001",
      author_confirmed: true,
    };
  }
  if (["evaluate-cycle", "evaluate-draft"].includes(command)) {
    const independent = command === "evaluate-draft";
    return {
      evaluation_id: "evaluation-reference-guard",
      ...(independent
        ? {
            requested_pass: context.evidence.passReference,
            target_scope: context.evidence.scopeReference,
            no_edit_skips: [],
            revision_executions: [],
          }
        : { cycle_id: "cycle-reference-guard", expected_revision: 1 }),
      coverage_index: context.evidence.coverageIndexReference,
      reports: [],
      review_group: context.evidence.reviewGroupReference,
      semantic_attestations: [],
    };
  }
  if (command.startsWith("prepare-")) {
    return command === "prepare-revision-execution"
      ? { ...context.execution, cycle_id: "cycle-reference-guard", expected_revision: 1 }
      : context.execution;
  }
  if (command.startsWith("verify-")) {
    return {
      ...(command === "verify-revision-execution"
        ? { cycle_id: "cycle-reference-guard", expected_revision: 1 }
        : {}),
      execution_id: context.execution.execution_id,
      requested_pass: context.evidence.passReference,
      target_scope: context.evidence.scopeReference,
    };
  }
  return {};
}

test("every public project command rejects missing and mismatched references before operation work", async (t) => {
  for (const mode of ["missing", "mismatched"]) {
    for (const command of commands) {
      await t.test(`${mode}: ${command}`, async (t) => {
        const { projectRoot, manifestPath } = await createConvergenceProject(t, {
          manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
        });
        const context = {};
        if (["evaluate-cycle", "evaluate-draft"].includes(command) || command.startsWith("prepare-") || command.startsWith("verify-")) {
          await recordScope(projectRoot, {
            scope_id: "scope-reference-guard",
            description: "The complete manuscript for reference guard checks.",
            status: "confirmed",
            files: [manuscriptFile],
            excluded_files: [],
            created_at: timestamp,
          }, {
            authorConfirmation: {
              decision_id: "SCOPE-001",
              confirmed_at: timestamp,
              reading_order_confirmed: true,
            },
            now: new Date(timestamp),
          });
          context.evidence = await createNoEditEvidence(projectRoot);
          context.execution = (await createRevisionExecutionFixture(projectRoot, {
            requestedPass: context.evidence.passReference,
            inputScope: context.evidence.scopeReference,
          })).execution;
        }
        const referencePath = path.join(projectRoot, ".author-toolkit", "references", "terminology.md");
        if (mode === "missing") await rm(referencePath, { force: true });
        else await writeFile(referencePath, "mismatched deployed reference\n", "utf8");
        const input = await validInput(command, projectRoot, context);
        let inputPath = null;
        if (input !== null) {
          inputPath = path.join(projectRoot, `${command}-reference-guard.json`);
          await writeJson(inputPath, input);
        }

        const result = runProject(projectRoot, command, inputPath);

        assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
        const response = JSON.parse(result.stdout);
        assert.equal(response.valid, false);
        assert.equal(response.command, command);
        assert.match(
          `${JSON.stringify(response.errors)}\n${JSON.stringify(response.result)}`,
          /reference-version-conflict|shared-reference-missing/,
        );
        assert.notEqual(response.errors[0]?.code, "usage-error");
      });
    }
  }
});

test("validator convergence queries and direct scope recording enforce deployed references", async (t) => {
  for (const query of ["--convergence-status", "--convergence-gate"]) {
    const { projectRoot, manifestPath } = await createConvergenceProject(t, {
          manuscripts: [{ name: "chapter-001.md", contents: manuscript }],
        });
    await rm(path.join(projectRoot, ".author-toolkit", "references", "terminology.md"), { force: true });
    const result = spawnSync(process.execPath, [validatorCli, query, manifestPath], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /reference-version-conflict|shared-reference-missing/);
  }

  const { projectRoot } = await createConvergenceProject(t);
  await rm(path.join(projectRoot, ".author-toolkit", "references", "terminology.md"), { force: true });
  await assert.rejects(
    recordScope(projectRoot, {
      scope_id: "scope-reference-guard",
      description: "Direct library reference guard.",
      status: "proposed",
      files: [manuscriptFile],
      excluded_files: [],
      created_at: timestamp,
    }),
    (error) => error.projectCode === "reference-version-conflict",
  );
});
