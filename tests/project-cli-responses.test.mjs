import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const packagedAssets = path.join(root, "skills", "setup-author-toolkit", "assets");

async function installedProject(t, { withManuscript = true } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-project-cli-"));
  t.after(async () => {
    await rm(temporary, { recursive: true, force: true });
  });
  const assets = path.join(temporary, "installed-skill", "assets");
  await cp(packagedAssets, assets, { recursive: true });
  const projectRoot = path.join(temporary, "writing-project");
  await mkdir(path.join(projectRoot, "manuscript"), { recursive: true });
  if (withManuscript) {
    await writeFile(
      path.join(projectRoot, "manuscript", "chapter-001.md"),
      "# Chapter One\n\nThe ferry leaves at dusk.\n",
      "utf8",
    );
  }
  const cli = path.join(assets, "runtime", "author-project.mjs");
  return {
    projectRoot,
    run(args) {
      return spawnSync(process.execPath, [cli, ...args], {
        cwd: temporary,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      });
    },
  };
}

function envelope(processResult, command) {
  const response = JSON.parse(processResult.stdout);
  assert.equal(response.response_contract_version, "1.0");
  assert.equal(response.command, command);
  assert.equal(typeof response.valid, "boolean");
  assert.ok(Object.hasOwn(response, "result"));
  assert.ok(Array.isArray(response.errors));
  return response;
}

test("installed timestamp returns JSON and filename values from one UTC clock", async (t) => {
  const { run } = await installedProject(t);
  const result = run([
    "timestamp",
    "--now",
    "2026-11-06T01:02:03.456Z",
  ]);

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const response = envelope(result, "timestamp");
  assert.equal(response.valid, true);
  assert.deepEqual(response.errors, []);
  assert.deepEqual(response.result, {
    json: "2026-11-06T01:02:03.456Z",
    filename: "20261106T010203456Z",
  });
  assert.equal(result.stderr, "");
});

test("installed init creates fresh operational state from manuscript only", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  const initialized = run(["init", "--project-root", projectRoot, "--language", "en"]);

  assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
  const response = envelope(initialized, "init");
  assert.equal(response.valid, true);
  assert.equal(response.result.initialized, true);
  assert.equal(response.errors.length, 0);

  const manifest = JSON.parse(await readFile(
    path.join(projectRoot, ".author-toolkit", "project.json"),
    "utf8",
  ));
  assert.equal(manifest.schema_version, "3.2.0");
  assert.equal(manifest.language, "en");
  assert.equal(Object.hasOwn(manifest, "current_scope"), false);
  assert.equal(Object.hasOwn(manifest, "pending_action"), false);
  assert.equal(Object.hasOwn(manifest, "last_completed_cycle"), false);

  const tracker = await readFile(path.join(projectRoot, "audit-tracker.md"), "utf8");
  assert.doesNotMatch(tracker, /^\| [A-Z][A-Z0-9]*-[0-9]{3,} \|/m);
  await assert.rejects(readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ), { code: "ENOENT" });
  await assert.rejects(readFile(
    path.join(projectRoot, ".author-toolkit", "convergence", "evaluations"),
    { encoding: "utf8" }),
    { code: "ENOENT" },
  );
});

test("compact status summarizes a valid unfinished project without full evidence", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  const initialized = run(["init", "--project-root", projectRoot, "--language", "en"]);
  assert.equal(initialized.status, 0, initialized.stderr);

  const status = run(["status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const response = envelope(status, "status");
  assert.equal(response.valid, true);
  assert.equal(response.errors.length, 0);
  assert.deepEqual(Object.keys(response.result).sort(), [
    "cycle",
    "decisions",
    "evaluation",
    "next_action",
    "pending_action",
    "project",
    "references",
    "scope",
    "view",
  ]);
  assert.equal(response.result.view, "compact");
  assert.equal(response.result.project.valid, true);
  assert.equal(response.result.references.valid, true);
  assert.equal(response.result.scope, null);
  assert.equal(response.result.pending_action, null);
  assert.equal(response.result.cycle, null);
  assert.equal(response.result.evaluation.outcome, "indeterminate");
  assert.equal(response.result.evaluation.current, false);
  assert.equal(response.result.evaluation.blockers[0].code, "current-evaluation-unavailable");
  assert.deepEqual(response.result.decisions, {
    findings: { total: 0, open: 0, resolved: 0, deferred: 0, dismissed: 0, stale: 0 },
    approvals: { total: 0, approved: 0, deferred: 0, cancelled: 0, superseded: 0 },
    cycle_completions: { total: 0, approved: 0, deferred: 0, cancelled: 0, superseded: 0 },
  });
  assert.deepEqual(response.result.next_action, {
    strategy: "revise-draft",
    operation: "intake",
    command: "revise-draft",
  });
  assert.equal(Object.hasOwn(response.result, "manifest"), false);
  assert.equal(Object.hasOwn(response.result.evaluation, "evidence_graph"), false);
  assert.equal(Object.hasOwn(response.result.evaluation, "evaluation"), false);
});

test("all existing project commands share structured responses and exit semantics", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  assert.equal(run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  const inputPath = path.join(projectRoot, "operation-input.json");
  await writeFile(inputPath, "{}\n", "utf8");

  const inputCommands = [
    "start-cycle",
    "transition-cycle",
    "evaluate-cycle",
    "evaluate-draft",
    "complete-cycle",
    "check-operation",
    "prepare-draft-revision-execution",
    "prepare-revision-execution",
    "verify-draft-revision-execution",
    "verify-revision-execution",
    "reconcile-manuscript",
  ];
  for (const command of inputCommands) {
    const processResult = run([command, "--project-root", projectRoot, "--input", inputPath]);
    assert.equal(processResult.status, 2, `${command}: ${processResult.stdout}\n${processResult.stderr}`);
    const response = envelope(processResult, command);
    assert.equal(response.valid, false, command);
    assert.equal(response.result, null, command);
    assert.equal(response.errors[0].code, "usage-error", command);
    assert.equal(typeof response.errors[0].message, "string", command);
    assert.equal(processResult.stderr, "", command);
  }

  for (const command of ["cycle-status", "convergence-status"]) {
    const processResult = run([command, "--project-root", projectRoot]);
    assert.equal(processResult.status, 0, `${command}: ${processResult.stdout}`);
    const response = envelope(processResult, command);
    assert.equal(response.valid, true);
    assert.equal(response.result.query_valid, true);
    assert.equal(response.result.outcome, "indeterminate");
    assert.deepEqual(response.errors, []);
  }
  for (const command of ["cycle-gate", "convergence-gate"]) {
    const processResult = run([command, "--project-root", projectRoot]);
    assert.equal(processResult.status, 1, `${command}: ${processResult.stdout}`);
    const response = envelope(processResult, command);
    assert.equal(response.valid, false);
    assert.equal(response.result.query_valid, true);
    assert.equal(response.result.outcome, "indeterminate");
    assert.equal(response.errors[0].code, "current-evaluation-unavailable");
  }

  const diagnosis = run(["reconcile-cycle", "--project-root", projectRoot]);
  assert.equal(diagnosis.status, 0, diagnosis.stdout);
  const diagnosisResponse = envelope(diagnosis, "reconcile-cycle");
  assert.equal(diagnosisResponse.valid, true);
  assert.equal(diagnosisResponse.result.diagnostic_only, true);
  assert.equal(diagnosisResponse.result.state_written, false);

  const unknown = run(["unknown-command"]);
  assert.equal(unknown.status, 2);
  const unknownResponse = envelope(unknown, "unknown-command");
  assert.equal(unknownResponse.valid, false);
  assert.equal(unknownResponse.result, null);
  assert.equal(unknownResponse.errors[0].code, "usage-error");
  assert.equal(unknown.stderr, "");
});

test("read defaults to compact and full queries expose exact state identities", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  assert.equal(run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manuscript = await readFile(path.join(projectRoot, "manuscript", "chapter-001.md"));
  const manuscriptHash = createHash("sha256").update(manuscript).digest("hex");
  const files = [{ path: "manuscript/chapter-001.md", sha256: manuscriptHash }];
  const scopeFingerprint = createHash("sha256").update(JSON.stringify({
    files,
    excluded_files: [],
  })).digest("hex");
  manifest.current_scope = {
    scope_id: "scope-draft-001",
    description: "Proposed manuscript-only scope",
    status: "proposed",
    files,
    excluded_files: [],
    created_at: manifest.created_at,
    scope_fingerprint: scopeFingerprint,
  };
  manifest.pending_action = {
    operation: "intake",
    status: "awaiting_author",
    scope_id: "scope-draft-001",
    reason: "The author must confirm the proposed scope and reading order.",
    artifacts: ["sessions/intake.md"],
    updated_at: manifest.updated_at,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(projectRoot, "sessions", "intake.md"), "# Intake\n", "utf8");
  await writeFile(path.join(projectRoot, "reports", "structure.md"), "# Structure\n", "utf8");

  const trackerPath = path.join(projectRoot, "audit-tracker.md");
  let tracker = await readFile(trackerPath, "utf8");
  const findingSeparator = "|---|---|---|---|---|---|---|---|\n";
  const findingIndex = tracker.indexOf(findingSeparator, tracker.indexOf("## Findings"));
  tracker = `${tracker.slice(0, findingIndex + findingSeparator.length)}| STRUCTURE-001 | structure | structure | manuscript/chapter-001.md:1 | open | reports/structure.md | ${manifest.updated_at} | Author review is required |\n${tracker.slice(findingIndex + findingSeparator.length)}`;
  const approvalSeparator = "|---|---|---|---|---|---|---|---|\n";
  const approvalIndex = tracker.indexOf(approvalSeparator, tracker.indexOf("## Approvals"));
  assert.ok(approvalIndex >= 0, "the approvals table separator exists");
  tracker = `${tracker.slice(0, approvalIndex + approvalSeparator.length)}| SCOPE-001 | scope-confirmation | intake | scope-draft-001 | \`manuscript/chapter-001.md\` | deferred | Author deferred the exact scope decision | ${manifest.updated_at} |\n${tracker.slice(approvalIndex + approvalSeparator.length)}`;
  await writeFile(trackerPath, tracker, "utf8");

  const compact = run(["read", "--project-root", projectRoot]);
  assert.equal(compact.status, 0, `${compact.stdout}\n${compact.stderr}`);
  const compactResponse = envelope(compact, "read");
  assert.equal(compactResponse.result.view, "compact");
  assert.deepEqual(compactResponse.result.scope, {
    scope_id: "scope-draft-001",
    scope_fingerprint: scopeFingerprint,
    status: "proposed",
    file_count: 1,
    full_manuscript: false,
  });
  assert.equal(Object.hasOwn(compactResponse.result.scope, "files"), false);
  assert.equal(compactResponse.result.pending_action.operation, "intake");
  assert.equal(compactResponse.result.decisions.findings.open, 1);
  assert.equal(
    compactResponse.result.decisions.approvals.deferred,
    1,
    JSON.stringify(compactResponse.result.decisions),
  );
  assert.equal(Object.hasOwn(compactResponse.result, "manifest"), false);

  for (const command of ["read", "status"]) {
    const full = run([command, "--project-root", projectRoot, "--full"]);
    assert.equal(full.status, 0, `${command}: ${full.stdout}\n${full.stderr}`);
    const response = envelope(full, command);
    assert.equal(response.result.view, "full");
    assert.equal(response.result.manifest.current_scope.files[0].sha256, manuscriptHash);
    assert.equal(response.result.status.query_valid, true);
    assert.equal(response.result.status.pending_action.operation, "intake");
    assert.equal(response.result.decisions.findings.open, 1);
  }
});

test("installed cycle success retains behavior and compact recovery hides full history", async (t) => {
  const { projectRoot, run } = await installedProject(t, { withManuscript: false });
  assert.equal(run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  const inputPath = path.join(projectRoot, "start.json");
  await writeFile(inputPath, `${JSON.stringify({
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  }, null, 2)}\n`, "utf8");

  const started = run(["start-cycle", "--project-root", projectRoot, "--input", inputPath]);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
  const startedResponse = envelope(started, "start-cycle");
  assert.equal(startedResponse.valid, true);
  assert.equal(startedResponse.result.cycle.status, "active");
  assert.equal(startedResponse.result.cycle.revision, 1);

  const status = run(["status", "--project-root", projectRoot]);
  assert.equal(status.status, 0, status.stdout);
  const compact = envelope(status, "status").result;
  assert.equal(compact.cycle.cycle_id, "cycle-bootstrap-001");
  assert.equal(compact.cycle.revision, 1);
  assert.equal(compact.cycle.recovery_position.operation, "creation-baseline");
  assert.deepEqual(compact.next_action, {
    strategy: "write-fiction",
    operation: "creation-baseline",
    command: "write-fiction",
  });
  assert.equal(Object.hasOwn(compact.cycle, "starting_scope"), false);
  assert.equal(Object.hasOwn(compact.cycle, "related_artifacts"), false);
  assert.equal(Object.hasOwn(compact.evaluation, "evaluation_reference"), false);

  const full = run(["read", "--project-root", projectRoot, "--full"]);
  const fullResult = envelope(full, "read").result;
  assert.equal(fullResult.status.cycle.cycle_id, "cycle-bootstrap-001");
  assert.equal(fullResult.status.cycle.starting_scope, null);
  assert.ok(fullResult.status.cycle.related_artifacts);

  const secondInput = path.join(projectRoot, "second.json");
  await writeFile(secondInput, `${JSON.stringify({
    cycle_id: "cycle-bootstrap-002",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  })}\n`, "utf8");
  const second = run(["start-cycle", "--project-root", projectRoot, "--input", secondInput]);
  assert.equal(second.status, 1);
  const secondResponse = envelope(second, "start-cycle");
  assert.equal(secondResponse.valid, false);
  assert.equal(secondResponse.errors[0].code, "active-cycle-exists");
});

test("read and write commands distinguish damaged state from usage errors", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  assert.equal(run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  const referencePath = path.join(
    projectRoot,
    ".author-toolkit",
    "references",
    "terminology.md",
  );
  const reference = await readFile(referencePath, "utf8");
  await writeFile(referencePath, "locally changed\n", "utf8");
  const conflict = run(["status", "--project-root", projectRoot]);
  assert.equal(conflict.status, 1);
  const conflictResponse = envelope(conflict, "status");
  assert.equal(conflictResponse.valid, false);
  assert.equal(conflictResponse.result.references.valid, false);
  assert.equal(conflictResponse.errors[0].code, "reference-version-conflict");
  assert.equal(conflictResponse.result.next_action.command, "setup-author-toolkit");

  await writeFile(referencePath, reference, "utf8");
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeFile(manifestPath, "{not json\n", "utf8");
  const malformed = run(["cycle-status", "--project-root", projectRoot]);
  assert.equal(malformed.status, 1);
  const malformedResponse = envelope(malformed, "cycle-status");
  assert.equal(malformedResponse.valid, false);
  assert.equal(malformedResponse.result.query_valid, false);
  assert.equal(malformedResponse.errors[0].code, "cycle-state-invalid");

  const inputPath = path.join(projectRoot, "start.json");
  await writeFile(inputPath, `${JSON.stringify({
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  })}\n`, "utf8");
  const write = run(["start-cycle", "--project-root", projectRoot, "--input", inputPath]);
  assert.equal(write.status, 1, write.stdout);
  const writeResponse = envelope(write, "start-cycle");
  assert.equal(writeResponse.valid, false);
  assert.equal(writeResponse.errors[0].code, "project-state-invalid");
});

test("init reentry preserves project state and rechecks references", async (t) => {
  const { projectRoot, run } = await installedProject(t);
  assert.equal(run(["init", "--project-root", projectRoot, "--language", "en"]).status, 0);
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.pending_action = {
    operation: "intake",
    status: "awaiting_author",
    reason: "The author is choosing the initial scope.",
    updated_at: manifest.updated_at,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const repeated = run(["init", "--project-root", projectRoot, "--language", "en"]);
  assert.equal(repeated.status, 0, repeated.stdout);
  const repeatedResponse = envelope(repeated, "init");
  assert.equal(repeatedResponse.result.initialized, false);
  const preserved = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(preserved.pending_action, manifest.pending_action);

  await writeFile(
    path.join(projectRoot, ".author-toolkit", "references", "terminology.md"),
    "locally changed\n",
    "utf8",
  );
  const conflict = run(["init", "--project-root", projectRoot, "--language", "en"]);
  assert.equal(conflict.status, 1);
  const conflictResponse = envelope(conflict, "init");
  assert.equal(conflictResponse.valid, false);
  assert.equal(conflictResponse.errors[0].code, "reference-version-conflict");
  assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")).pending_action, manifest.pending_action);
});
