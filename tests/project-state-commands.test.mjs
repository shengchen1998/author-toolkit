import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { recordProjectScope, setPendingAction } from "../scripts/lib/index.mjs";
import { root } from "./helpers.mjs";

const packagedAssets = path.join(root, "skills", "setup-author-toolkit", "assets");

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function installedProject(t, { withManuscript = true } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), "author-toolkit-state-commands-"));
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
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  return {
    projectRoot,
    manifestPath,
    run(args) {
      return spawnSync(process.execPath, [cli, ...args], {
        cwd: temporary,
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: "" },
      });
    },
    async initialize(input = {}) {
      const inputPath = path.join(projectRoot, "initialize.json");
      await writeFile(inputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
      const initialized = this.run(["init", "--project-root", projectRoot, "--input", inputPath]);
      assert.equal(initialized.status, 0, `${initialized.stdout}\n${initialized.stderr}`);
      return initialized;
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

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("set-pending records active-cycle coordination without creating approval", async (t) => {
  const project = await installedProject(t, { withManuscript: false });
  await project.initialize({ language: "en" });
  const startPath = path.join(project.projectRoot, "start.json");
  await writeJson(startPath, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  const started = project.run([
    "start-cycle",
    "--project-root",
    project.projectRoot,
    "--input",
    startPath,
  ]);
  assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);

  const manifestText = await readFile(project.manifestPath, "utf8");
  const trackerPath = path.join(project.projectRoot, "audit-tracker.md");
  const trackerBefore = await readFile(trackerPath, "utf8");
  const activeCyclePath = path.join(
    project.projectRoot,
    ".author-toolkit",
    "convergence",
    "active-cycle.json",
  );
  const activeCycleBefore = await readFile(activeCyclePath, "utf8");
  await writeFile(path.join(project.projectRoot, "sessions", "baseline.md"), "# Baseline\n", "utf8");
  const inputPath = path.join(project.projectRoot, "pending.json");
  await writeJson(inputPath, {
    operation: "creation-baseline",
    status: "awaiting_author",
    reason: "The author must approve the exact writing plan before creation.",
    artifacts: ["sessions/baseline.md"],
    expected_manifest_sha256: sha256(manifestText),
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 1,
  });

  const recorded = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 0, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "set-pending");
  assert.equal(response.valid, true);
  assert.equal(response.result.state_written, true);
  assert.deepEqual(response.result.pending_action, {
    operation: "creation-baseline",
    status: "awaiting_author",
    reason: "The author must approve the exact writing plan before creation.",
    artifacts: ["sessions/baseline.md"],
    cycle_id: "cycle-bootstrap-001",
    cycle_revision: 1,
    operation_id: "start-cycle-bootstrap-001",
    updated_at: response.result.pending_action.updated_at,
  });
  assert.equal(response.errors.length, 0);
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.deepEqual(manifest.pending_action, response.result.pending_action);
  assert.equal(Object.hasOwn(manifest, "current_scope"), false);
  assert.equal(await readFile(activeCyclePath, "utf8"), activeCycleBefore);
  assert.equal(await readFile(trackerPath, "utf8"), trackerBefore);
});

test("set-pending preserves the current scope and appends unique artifact references", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  const manuscriptPath = path.join(project.projectRoot, "manuscript", "chapter-001.md");
  const files = [{
    path: "manuscript/chapter-001.md",
    sha256: sha256(await readFile(manuscriptPath)),
  }];
  const currentScope = {
    scope_id: "scope-proposed-001",
    description: "The proposed initial manuscript.",
    status: "proposed",
    files,
    excluded_files: [],
    created_at: manifest.created_at,
    scope_fingerprint: sha256(JSON.stringify({ files, excluded_files: [] })),
  };
  await writeFile(path.join(project.projectRoot, "sessions", "old.md"), "# Old\n", "utf8");
  await writeFile(path.join(project.projectRoot, "sessions", "new.md"), "# New\n", "utf8");
  manifest.current_scope = currentScope;
  manifest.pending_action = {
    operation: "intake",
    status: "in_progress",
    reason: "Inventory is in progress.",
    artifacts: ["sessions/old.md"],
    updated_at: manifest.updated_at,
  };
  await writeJson(project.manifestPath, manifest);
  const expectedManifestHash = sha256(await readFile(project.manifestPath, "utf8"));
  const inputPath = path.join(project.projectRoot, "pending.json");
  await writeJson(inputPath, {
    operation: "intake",
    status: "awaiting_author",
    scope_id: currentScope.scope_id,
    scope_fingerprint: currentScope.scope_fingerprint,
    reason: "The author must confirm the proposed scope.",
    artifacts: ["sessions/old.md", "sessions/new.md"],
    expected_manifest_sha256: expectedManifestHash,
  });

  const recorded = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 0, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "set-pending");
  assert.equal(response.valid, true);
  assert.equal(response.result.pending_action.scope_id, currentScope.scope_id);
  assert.equal(response.result.pending_action.scope_fingerprint, currentScope.scope_fingerprint);
  assert.deepEqual(response.result.pending_action.artifacts, ["sessions/old.md", "sessions/new.md"]);
  const updated = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.deepEqual(updated.current_scope, currentScope);
  assert.equal(Object.hasOwn(updated.pending_action, "cycle_id"), false);
  assert.equal(Object.hasOwn(updated.pending_action, "operation_id"), false);
});

test("set-pending rejects a stale manifest hash without overwriting newer state", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const before = await readFile(project.manifestPath, "utf8");
  const inputPath = path.join(project.projectRoot, "pending.json");
  await writeJson(inputPath, {
    operation: "intake",
    status: "blocked",
    reason: "The input was prepared against an older manifest.",
    expected_manifest_sha256: "0".repeat(64),
  });

  const recorded = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 1, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "set-pending");
  assert.equal(response.valid, false);
  assert.equal(response.result.state_written, false);
  assert.equal(response.errors[0].code, "manifest-hash-conflict");
  assert.equal(response.result.recovery.manifest_sha256, sha256(before));
  assert.equal(await readFile(project.manifestPath, "utf8"), before);
});

test("record-scope computes a proposed scope from current manuscript bytes", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  await writeFile(path.join(project.projectRoot, "manuscript", "cover.png"), "cover", "utf8");
  const manuscriptHash = sha256(
    await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md")),
  );
  const expectedFiles = [{ path: "manuscript/chapter-001.md", sha256: manuscriptHash }];
  const expectedExclusions = ["manuscript/cover.png"];
  const expectedFingerprint = sha256(JSON.stringify({
    files: expectedFiles,
    excluded_files: expectedExclusions,
  }));
  const inputPath = path.join(project.projectRoot, "scope.json");
  await writeJson(inputPath, {
    scope_id: "scope-proposed-001",
    description: "The complete manuscript in reading order, pending author confirmation.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
    expected_manifest_sha256: sha256(await readFile(project.manifestPath, "utf8")),
  });

  const recorded = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 0, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "record-scope");
  assert.equal(response.valid, true);
  assert.equal(response.result.state_written, true);
  assert.equal(response.result.scope_id, "scope-proposed-001");
  assert.equal(response.result.scope_fingerprint, expectedFingerprint);
  assert.equal(response.result.inventory_fingerprint, null);
  assert.equal(response.result.snapshot, null);
  assert.equal(response.result.validation.full_manuscript, false);
  assert.equal(response.result.validation.valid, false);
  assert.ok(response.result.validation.blockers.some((blocker) =>
    blocker.code === "scope-status"
  ));
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.equal(manifest.current_scope.scope_fingerprint, expectedFingerprint);
  assert.deepEqual(manifest.current_scope.files, expectedFiles);
  assert.deepEqual(manifest.current_scope.excluded_files, expectedExclusions);
  assert.equal(typeof manifest.current_scope.created_at, "string");
  assert.equal(Object.hasOwn(manifest.current_scope, "snapshot_path"), false);
});

test("record-scope confirms exact reading-order evidence with immutable snapshots", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  await writeFile(path.join(project.projectRoot, "manuscript", "cover.png"), "cover", "utf8");
  const proposedPath = path.join(project.projectRoot, "proposed.json");
  await writeJson(proposedPath, {
    scope_id: "scope-confirmed-001",
    description: "The author reviewed the complete manuscript in this reading order.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  const proposed = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    proposedPath,
  ]);
  assert.equal(proposed.status, 0, `${proposed.stdout}\n${proposed.stderr}`);
  const proposedManifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  const proposedScope = proposedManifest.current_scope;
  const confirmation = {
    decision_id: "SCOPE-001",
    confirmed_at: proposedManifest.updated_at,
    reading_order_confirmed: true,
  };
  const confirmedPath = path.join(project.projectRoot, "confirmed.json");
  await writeJson(confirmedPath, {
    ...proposedScope,
    status: "confirmed",
    author_confirmation: confirmation,
    expected_manifest_sha256: sha256(await readFile(project.manifestPath, "utf8")),
  });

  const confirmed = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    confirmedPath,
  ]);
  assert.equal(confirmed.status, 0, `${confirmed.stdout}\n${confirmed.stderr}`);
  const response = envelope(confirmed, "record-scope");
  assert.equal(response.valid, true);
  assert.equal(response.result.scope_fingerprint, proposedScope.scope_fingerprint);
  assert.equal(response.result.validation.valid, true);
  assert.equal(response.result.validation.full_manuscript, true);
  assert.deepEqual(response.result.validation.blockers, []);
  const expectedInventoryFingerprint = sha256(JSON.stringify({
    manuscript_root: "manuscript/",
    files: proposedScope.files,
    excluded_files: ["manuscript/cover.png"],
  }));
  assert.equal(response.result.inventory_fingerprint, expectedInventoryFingerprint);
  const snapshotRelative = `.author-toolkit/convergence/scopes/scope-confirmed-001-${proposedScope.scope_fingerprint}.json`;
  const inventoryRelative = `.author-toolkit/convergence/inventories/${expectedInventoryFingerprint}.json`;
  assert.deepEqual(response.result.snapshot, {
    path: snapshotRelative,
    sha256: response.result.snapshot.sha256,
  });
  assert.deepEqual(response.result.inventory, {
    path: inventoryRelative,
    sha256: response.result.inventory.sha256,
    inventory_fingerprint: expectedInventoryFingerprint,
  });
  const snapshotText = await readFile(path.join(project.projectRoot, snapshotRelative), "utf8");
  const inventoryText = await readFile(path.join(project.projectRoot, inventoryRelative), "utf8");
  assert.equal(response.result.snapshot.sha256, sha256(snapshotText));
  assert.equal(response.result.inventory.sha256, sha256(inventoryText));
  const snapshot = JSON.parse(snapshotText);
  assert.deepEqual(snapshot.files, proposedScope.files);
  assert.deepEqual(snapshot.excluded_files, ["manuscript/cover.png"]);
  assert.deepEqual(snapshot.author_confirmation, confirmation);
  assert.equal(snapshot.created_at, proposedScope.created_at);
  assert.equal(snapshot.inventory.inventory_fingerprint, expectedInventoryFingerprint);
  assert.deepEqual(JSON.parse(inventoryText).files, proposedScope.files);

  const status = project.run(["status", "--project-root", project.projectRoot]);
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  const statusResponse = envelope(status, "status");
  assert.equal(statusResponse.result.scope.full_manuscript, true);
  assert.equal(statusResponse.result.scope.scope_fingerprint, proposedScope.scope_fingerprint);
});

test("record-scope rejects changed manuscript hashes without replacing the proposed scope", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const proposedPath = path.join(project.projectRoot, "proposed.json");
  await writeJson(proposedPath, {
    scope_id: "scope-changed-001",
    description: "The proposed scope before an external manuscript change.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
  });
  const proposed = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    proposedPath,
  ]);
  assert.equal(proposed.status, 0, `${proposed.stdout}\n${proposed.stderr}`);
  const before = await readFile(project.manifestPath, "utf8");
  const proposedScope = JSON.parse(before).current_scope;
  await writeFile(
    path.join(project.projectRoot, "manuscript", "chapter-001.md"),
    "# Chapter One\n\nThe ferry leaves at dawn instead.\n",
    "utf8",
  );
  const confirmedPath = path.join(project.projectRoot, "confirmed.json");
  await writeJson(confirmedPath, {
    ...proposedScope,
    status: "confirmed",
    author_confirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: "2026-11-07T00:00:00.000Z",
      reading_order_confirmed: true,
    },
  });

  const confirmed = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    confirmedPath,
  ]);
  assert.equal(confirmed.status, 1, `${confirmed.stdout}\n${confirmed.stderr}`);
  const response = envelope(confirmed, "record-scope");
  assert.equal(response.valid, false);
  assert.equal(response.result.state_written, false);
  assert.equal(response.errors[0].code, "scope-input-hash-conflict");
  assert.equal(response.errors[0].path, "manuscript/chapter-001.md");
  assert.equal(response.errors[0].expected_sha256, proposedScope.files[0].sha256);
  assert.equal(response.errors[0].actual_sha256, sha256(
    await readFile(path.join(project.projectRoot, "manuscript", "chapter-001.md")),
  ));
  assert.equal(await readFile(project.manifestPath, "utf8"), before);
});

test("state commands honor custom operational paths", async (t) => {
  const project = await installedProject(t);
  await project.initialize({
    language: "en",
    paths: {
      sessions: "state/sessions/",
      reports: "state/reports/",
      backups: "state/backups/",
      handoffs: "state/handoffs/",
      creation: "state/creation/",
      convergence: "state/convergence/",
    },
  });
  const operationTime = JSON.parse(await readFile(project.manifestPath, "utf8")).updated_at;
  const scopePath = path.join(project.projectRoot, "scope.json");
  await writeJson(scopePath, {
    scope_id: "scope-custom-001",
    description: "The complete manuscript using registered custom operational paths.",
    status: "confirmed",
    files: ["manuscript/chapter-001.md"],
    created_at: operationTime,
    author_confirmation: {
      decision_id: "SCOPE-CUSTOM-001",
      confirmed_at: operationTime,
      reading_order_confirmed: true,
    },
  });
  const scoped = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    scopePath,
  ]);
  assert.equal(scoped.status, 0, `${scoped.stdout}\n${scoped.stderr}`);
  const scopeResponse = envelope(scoped, "record-scope");
  assert.equal(scopeResponse.result.validation.full_manuscript, true);
  assert.match(scopeResponse.result.snapshot.path, /^state\/convergence\/scopes\//);
  assert.match(scopeResponse.result.inventory.path, /^state\/convergence\/inventories\//);

  await writeFile(
    path.join(project.projectRoot, "state", "sessions", "intake.md"),
    "# Custom intake\n",
    "utf8",
  );
  const pendingPath = path.join(project.projectRoot, "pending.json");
  await writeJson(pendingPath, {
    operation: "intake",
    status: "awaiting_author",
    reason: "The custom session artifact awaits the author.",
    artifacts: ["state/sessions/intake.md"],
    expected_manifest_sha256: sha256(await readFile(project.manifestPath, "utf8")),
  });
  const pending = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    pendingPath,
  ]);
  assert.equal(pending.status, 0, `${pending.stdout}\n${pending.stderr}`);
  const pendingResponse = envelope(pending, "set-pending");
  assert.equal(pendingResponse.result.pending_action.scope_id, "scope-custom-001");
  assert.equal(
    pendingResponse.result.pending_action.scope_fingerprint,
    scopeResponse.result.scope_fingerprint,
  );
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.equal(manifest.current_scope.snapshot_path, scopeResponse.result.snapshot.path);
  await assert.rejects(readFile(
    path.join(project.projectRoot, ".author-toolkit", "convergence", "active-cycle.json"),
    "utf8",
  ), { code: "ENOENT" });
});

test("confirmed scope interruption preserves snapshots and supports an exact retry", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const now = new Date();
  const request = {
    scope_id: "scope-interrupted-001",
    description: "The exact confirmed scope resumed after an interrupted publication.",
    status: "confirmed",
    files: ["manuscript/chapter-001.md"],
    created_at: now.toISOString(),
    author_confirmation: {
      decision_id: "SCOPE-RETRY-001",
      confirmed_at: now.toISOString(),
      reading_order_confirmed: true,
    },
    expected_manifest_sha256: sha256(await readFile(project.manifestPath, "utf8")),
  };
  const interrupted = await recordProjectScope(project.projectRoot, request, {
    now,
    checkpoint(point) {
      if (point === "snapshot-published") throw new Error("Simulated interruption after snapshot publication");
    },
  });
  assert.equal(interrupted.valid, false);
  assert.equal(interrupted.state_written, true);
  assert.equal(interrupted.errors, undefined);
  assert.equal(interrupted.blockers[0].code, "scope-write-interrupted");
  assert.equal(interrupted.recovery.inventory_published, true);
  assert.equal(interrupted.recovery.snapshot_published, true);
  assert.equal(interrupted.recovery.manifest_updated, false);
  assert.equal(interrupted.recovery.current_scope, null);
  const snapshotBefore = await readFile(interrupted.recovery.snapshot_path, "utf8");
  const inventoryBefore = await readFile(interrupted.recovery.inventory_path, "utf8");
  const manifestBefore = await readFile(project.manifestPath, "utf8");

  const resumed = await recordProjectScope(project.projectRoot, request, { now });
  assert.equal(resumed.valid, true, JSON.stringify(resumed.blockers));
  assert.equal(resumed.validation.full_manuscript, true, JSON.stringify(resumed.validation));
  assert.equal(await readFile(interrupted.recovery.snapshot_path, "utf8"), snapshotBefore);
  assert.equal(await readFile(interrupted.recovery.inventory_path, "utf8"), inventoryBefore);
  assert.notEqual(await readFile(project.manifestPath, "utf8"), manifestBefore);
  await assert.rejects(readFile(
    path.join(project.projectRoot, ".author-toolkit", "convergence", "active-cycle.lock", "owner.json"),
    "utf8",
  ), { code: "ENOENT" });
});

test("pending-action interruption reports the actual published recovery state", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const now = new Date();
  const request = {
    operation: "intake",
    status: "blocked",
    reason: "The command was interrupted after its verified manifest publication.",
    expected_manifest_sha256: sha256(await readFile(project.manifestPath, "utf8")),
  };
  const interrupted = await setPendingAction(project.projectRoot, request, {
    now,
    checkpoint(point) {
      if (point === "manifest-updated") throw new Error("Simulated post-publication interruption");
    },
  });
  assert.equal(interrupted.valid, false);
  assert.equal(interrupted.state_written, true);
  assert.equal(interrupted.blockers[0].code, "pending-action-write-interrupted");
  assert.equal(interrupted.recovery.pending_action.operation, "intake");
  assert.equal(interrupted.recovery.pending_action.updated_at, now.toISOString());
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.deepEqual(manifest.pending_action, interrupted.recovery.pending_action);
  assert.equal(interrupted.recovery.manifest_sha256, sha256(await readFile(project.manifestPath, "utf8")));
});

test("scope recording rereads the manifest after acquiring the lock", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const staleHash = sha256(await readFile(project.manifestPath, "utf8"));
  let newerText;
  const result = await recordProjectScope(project.projectRoot, {
    scope_id: "scope-race-001",
    description: "This scope was prepared before another writer changed the manifest.",
    status: "proposed",
    files: ["manuscript/chapter-001.md"],
    expected_manifest_sha256: staleHash,
  }, {
    async checkpoint(point) {
      if (point !== "lock-acquired") return;
      const newer = JSON.parse(await readFile(project.manifestPath, "utf8"));
      newer.pending_action = {
        operation: "intake",
        status: "blocked",
        reason: "A newer writer owns the recovery decision.",
        updated_at: "2026-11-07T00:00:00.000Z",
      };
      newer.updated_at = "2026-11-07T00:00:00.000Z";
      await writeJson(project.manifestPath, newer);
      newerText = await readFile(project.manifestPath, "utf8");
    },
  });
  assert.equal(result.valid, false);
  assert.equal(result.state_written, false);
  assert.equal(result.blockers[0].code, "manifest-hash-conflict");
  assert.equal(result.recovery.pending_action.reason, "A newer writer owns the recovery decision.");
  assert.equal(await readFile(project.manifestPath, "utf8"), newerText);
});

test("record-scope rejects unsafe paths, stale exclusions, and missing reading-order confirmation", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const before = await readFile(project.manifestPath, "utf8");
  const cases = [
    {
      name: "unsafe path",
      input: {
        scope_id: "scope-unsafe-001",
        description: "An unsafe path must not enter scope.",
        status: "proposed",
        files: ["../outside.md"],
      },
      code: "scope-path-invalid",
    },
    {
      name: "stale exclusions",
      input: {
        scope_id: "scope-exclusions-001",
        description: "Exclusions must match the actual inventory.",
        status: "proposed",
        files: ["manuscript/chapter-001.md"],
        excluded_files: ["manuscript/not-present.png"],
      },
      code: "scope-exclusions-conflict",
    },
    {
      name: "unconfirmed reading order",
      input: {
        scope_id: "scope-unconfirmed-001",
        description: "A boolean false cannot confirm the reading order.",
        status: "confirmed",
        files: ["manuscript/chapter-001.md"],
        author_confirmation: {
          decision_id: "SCOPE-NO-001",
          confirmed_at: "2026-11-07T00:00:00.000Z",
          reading_order_confirmed: false,
        },
      },
      code: "scope-confirmation-required",
    },
  ];
  for (const [index, scenario] of cases.entries()) {
    const inputPath = path.join(project.projectRoot, `invalid-scope-${index}.json`);
    await writeJson(inputPath, scenario.input);
    const processResult = project.run([
      "record-scope",
      "--project-root",
      project.projectRoot,
      "--input",
      inputPath,
    ]);
    assert.equal(processResult.status, 1, `${scenario.name}: ${processResult.stdout}`);
    const response = envelope(processResult, "record-scope");
    assert.equal(response.valid, false, scenario.name);
    assert.equal(response.result.state_written, false, scenario.name);
    assert.equal(response.errors[0].code, scenario.code, scenario.name);
    assert.equal(await readFile(project.manifestPath, "utf8"), before, scenario.name);
  }
});

test("set-pending rejects a stale active-cycle revision", async (t) => {
  const project = await installedProject(t, { withManuscript: false });
  await project.initialize({ language: "en" });
  const startPath = path.join(project.projectRoot, "start.json");
  await writeJson(startPath, {
    cycle_id: "cycle-bootstrap-001",
    initiating_strategy: "write-fiction",
    bootstrap: true,
    starting_scope: null,
  });
  assert.equal(project.run([
    "start-cycle",
    "--project-root",
    project.projectRoot,
    "--input",
    startPath,
  ]).status, 0);
  const before = await readFile(project.manifestPath, "utf8");
  const pendingPath = path.join(project.projectRoot, "pending.json");
  await writeJson(pendingPath, {
    operation: "creation-baseline",
    status: "in_progress",
    reason: "The request was prepared against an older cycle revision.",
    cycle_id: "cycle-bootstrap-001",
    expected_revision: 2,
  });
  const recorded = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    pendingPath,
  ]);
  assert.equal(recorded.status, 1, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "set-pending");
  assert.equal(response.valid, false);
  assert.equal(response.result.state_written, false);
  assert.equal(response.errors[0].code, "cycle-revision-conflict");
  assert.equal(await readFile(project.manifestPath, "utf8"), before);
});

test("set-pending returns a structured validation failure for an invalid operation", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const before = await readFile(project.manifestPath, "utf8");
  const inputPath = path.join(project.projectRoot, "pending.json");
  await writeJson(inputPath, {
    operation: "not-an-operation",
    status: "in_progress",
    reason: "The operation name is outside the controlled contract.",
  });
  const recorded = project.run([
    "set-pending",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 1, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "set-pending");
  assert.equal(response.valid, false);
  assert.equal(response.errors[0].code, "pending-action-invalid");
  assert.equal(response.result.state_written, false);
  assert.ok(response.result.validation_errors.length > 0);
  assert.equal(await readFile(project.manifestPath, "utf8"), before);
});

test("record-scope distinguishes evidence validation failures from write interruptions", async (t) => {
  const project = await installedProject(t);
  await project.initialize({ language: "en" });
  const before = await readFile(project.manifestPath, "utf8");
  const inputPath = path.join(project.projectRoot, "future-scope.json");
  await writeJson(inputPath, {
    scope_id: "scope-future-001",
    description: "Future confirmation evidence must fail validation without a write interruption.",
    status: "confirmed",
    files: ["manuscript/chapter-001.md"],
    created_at: JSON.parse(before).updated_at,
    author_confirmation: {
      decision_id: "SCOPE-FUTURE-001",
      confirmed_at: new Date(Date.now() + 120000).toISOString(),
      reading_order_confirmed: true,
    },
  });
  const recorded = project.run([
    "record-scope",
    "--project-root",
    project.projectRoot,
    "--input",
    inputPath,
  ]);
  assert.equal(recorded.status, 1, `${recorded.stdout}\n${recorded.stderr}`);
  const response = envelope(recorded, "record-scope");
  assert.equal(response.valid, false);
  assert.equal(response.errors[0].code, "scope-recording-failed");
  assert.match(response.errors[0].message, /60 seconds/);
  assert.equal(response.result.state_written, false);
  assert.equal(await readFile(project.manifestPath, "utf8"), before);
});
