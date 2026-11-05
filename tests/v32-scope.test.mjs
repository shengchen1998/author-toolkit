import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  recordScope,
  validateFullManuscriptScope,
  validateInventorySnapshot,
  validateManifest,
  validateScopeSnapshot,
} from "../scripts/lib/index.mjs";
import { root } from "./helpers.mjs";

const timestamp = "2026-11-05T00:00:00Z";
const expectedFingerprint = "943ae0d0924ba9547b4acd3cc97b10a761e48374a34288be66f76da0a2e7436a";
const validator = path.join(root, "scripts", "validate.mjs");

function manifestV32() {
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

function confirmedScope() {
  return {
    scope_id: "scope-1",
    description: "The author confirmed both chapters in reading order.",
    status: "confirmed",
    files: [
      {
        path: "manuscript/chapter-001.md",
        sha256: "8f2c2c94b3445f1042e43bd0a2347a37feb0701b82359125bc98a512d9f207d0",
      },
      {
        path: "manuscript/chapter-002.md",
        sha256: "7dc563d228af2723a0a91b3eede22ccd72c6d5f73089eeefc39132e77e83d494",
      },
    ],
    excluded_files: ["manuscript/cover.png"],
    created_at: timestamp,
  };
}

function authorConfirmation() {
  return {
    decision_id: "SCOPE-001",
    confirmed_at: timestamp,
    reading_order_confirmed: true,
  };
}

async function createProject(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "v32-scope-"));
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
  await writeFile(path.join(projectRoot, "audit-tracker.md"), "Tracker\n", "utf8");
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-001.md"),
    "Chapter one\n",
    "utf8",
  );
  await writeFile(
    path.join(projectRoot, "manuscript", "chapter-002.md"),
    "Chapter two\n",
    "utf8",
  );
  await writeFile(path.join(projectRoot, "manuscript", "cover.png"), "cover", "utf8");
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  await writeFile(manifestPath, `${JSON.stringify(manifestV32(), null, 2)}\n`, "utf8");
  return { projectRoot, manifestPath };
}

async function confirmProject(t, scope = confirmedScope()) {
  const project = await createProject(t);
  const recorded = await recordScope(project.projectRoot, scope, {
    authorConfirmation: authorConfirmation(),
    now: new Date(timestamp),
  });
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  return { ...project, manifest, recorded };
}

async function writeValidTracker(projectRoot) {
  const tracker = await readFile(
    path.join(root, "skills", "author-project", "assets", "audit-tracker-template.md"),
    "utf8",
  );
  await writeFile(path.join(projectRoot, "audit-tracker.md"), tracker, "utf8");
}

function runValidator(args) {
  return spawnSync(process.execPath, [validator, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("v3.2 registers a project-local convergence state root", () => {
  assert.equal(validateManifest(manifestV32()).valid, true);

  const missing = manifestV32();
  delete missing.paths.convergence;
  const result = validateManifest(missing);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (error) =>
        error.instancePath === "/paths" && error.params.missingProperty === "convergence",
    ),
  );
});

test("confirming a scope writes immutable inventory and scope snapshots", async (t) => {
  const { projectRoot, manifestPath } = await createProject(t);
  const scope = confirmedScope();
  const confirmation = authorConfirmation();
  const result = await recordScope(projectRoot, scope, {
    authorConfirmation: confirmation,
    now: new Date(timestamp),
  });

  assert.equal(result.scope_fingerprint, expectedFingerprint);
  const snapshotPath = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "scopes",
    `scope-1-${result.scope_fingerprint}.json`,
  );
  const inventoryPath = path.join(
    projectRoot,
    ".author-toolkit",
    "convergence",
    "inventories",
    `${result.inventory_fingerprint}.json`,
  );
  assert.equal(result.snapshot_path, snapshotPath);
  assert.equal(result.inventory_path, inventoryPath);

  const snapshotText = await readFile(snapshotPath, "utf8");
  const inventoryText = await readFile(inventoryPath, "utf8");
  const snapshot = JSON.parse(snapshotText);
  const inventory = JSON.parse(inventoryText);
  assert.deepEqual(snapshot.files, scope.files);
  assert.deepEqual(snapshot.excluded_files, ["manuscript/cover.png"]);
  assert.deepEqual(snapshot.author_confirmation, confirmation);
  assert.equal(
    snapshot.inventory.path,
    `.author-toolkit/convergence/inventories/${result.inventory_fingerprint}.json`,
  );
  assert.deepEqual(inventory.files, scope.files);
  assert.deepEqual(inventory.excluded_files, ["manuscript/cover.png"]);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.current_scope.scope_fingerprint, result.scope_fingerprint);
  assert.equal(
    manifest.current_scope.snapshot_path,
    `.author-toolkit/convergence/scopes/scope-1-${result.scope_fingerprint}.json`,
  );

  await assert.rejects(
    recordScope(projectRoot, scope, {
      authorConfirmation: { ...confirmation, decision_id: "SCOPE-002" },
      now: new Date("2026-11-05T01:00:00Z"),
    }),
    /immutable|already exists/i,
  );
  assert.equal(await readFile(snapshotPath, "utf8"), snapshotText);
  assert.equal(await readFile(inventoryPath, "utf8"), inventoryText);
});

test("public project validation recognizes a current full-manuscript scope", async (t) => {
  const project = await confirmProject(t);
  const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.full_manuscript, true);
  assert.equal(result.scope_id, "scope-1");
  assert.equal(result.scope_fingerprint, project.recorded.scope_fingerprint);
  assert.equal(result.inventory_fingerprint, project.recorded.inventory_fingerprint);
});

test("full-manuscript validation rejects duplicate and non-manuscript paths", async (t) => {
  await t.test("duplicate paths", async (t) => {
    const project = await confirmProject(t);
    project.manifest.current_scope.files.push(project.manifest.current_scope.files[0]);
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-uniqueness"));
  });

  await t.test("non-manuscript paths", async (t) => {
    const project = await confirmProject(t);
    project.manifest.current_scope.files[0].path = "story-bible.md";
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) => /not a current manuscript-inventory path/.test(error.message)),
    );
  });

  await t.test("a proposed scope", async (t) => {
    const proposed = { ...confirmedScope(), status: "proposed" };
    const { projectRoot, manifestPath } = await createProject(t);
    await recordScope(projectRoot, proposed, { now: new Date(timestamp) });
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const result = await validateFullManuscriptScope(manifest, manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-status"));
  });

  await t.test("an incomplete scope", async (t) => {
    const narrowed = { ...confirmedScope(), files: [confirmedScope().files[0]] };
    const project = await confirmProject(t, narrowed);
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-inventory"));
  });

  await t.test("an unconfirmed snapshot reading order", async (t) => {
    const project = await confirmProject(t);
    const snapshot = JSON.parse(await readFile(project.recorded.snapshot_path, "utf8"));
    snapshot.author_confirmation.reading_order_confirmed = false;
    const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeFile(project.recorded.snapshot_path, snapshotText, "utf8");
    project.manifest.current_scope.snapshot_sha256 = createHash("sha256")
      .update(snapshotText)
      .digest("hex");
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-confirmation"));
  });
});

test("full-manuscript validation reports current disk and scope drift", async (t) => {
  await t.test("an unregistered manuscript", async (t) => {
    const project = await confirmProject(t);
    await writeFile(path.join(project.projectRoot, "manuscript", "chapter-003.md"), "New\n", "utf8");
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => /not registered/.test(error.message)));
  });

  await t.test("a missing manuscript", async (t) => {
    const project = await confirmProject(t);
    await rm(path.join(project.projectRoot, "manuscript", "chapter-001.md"));
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => /cannot read current manuscript/.test(error.message)));
  });

  await t.test("changed manuscript hashes", async (t) => {
    const project = await confirmProject(t);
    await writeFile(
      path.join(project.projectRoot, "manuscript", "chapter-001.md"),
      "Changed\n",
      "utf8",
    );
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-currency"));
  });

  await t.test("changed reading order", async (t) => {
    const project = await confirmProject(t);
    project.manifest.current_scope.files.reverse();
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-order"));
  });

  await t.test("changed exclusions", async (t) => {
    const project = await confirmProject(t);
    await writeFile(path.join(project.projectRoot, "manuscript", "cover-2.png"), "new", "utf8");
    const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.keyword === "scope-exclusions"));
  });
});

test("the public CLI validates scope and inventory snapshots and exposes scope identity", async (t) => {
  const project = await confirmProject(t);
  await writeValidTracker(project.projectRoot);
  const result = runValidator([
    "--manifest",
    project.manifestPath,
    "--scope-snapshot",
    project.recorded.snapshot_path,
    "--inventory-snapshot",
    project.recorded.inventory_path,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /6 checks, 0 failures/);
  assert.match(
    result.stdout,
    new RegExp(`scope_id=scope-1 scope_fingerprint=${project.recorded.scope_fingerprint}`),
  );
  assert.match(result.stdout, /full_manuscript=true/);

  const help = runValidator(["--help"]);
  assert.match(help.stdout, /--scope-snapshot FILE/);
  assert.match(help.stdout, /--inventory-snapshot FILE/);

  const snapshot = JSON.parse(await readFile(project.recorded.snapshot_path, "utf8"));
  snapshot.scope_fingerprint = "0".repeat(64);
  const invalidPath = path.join(project.projectRoot, "invalid-scope.json");
  await writeFile(invalidPath, JSON.stringify(snapshot), "utf8");
  const invalid = runValidator(["--scope-snapshot", invalidPath]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /scope_fingerprint|canonical content/);
});

test("the public CLI rejects a proposed scope as less than full-manuscript evidence", async (t) => {
  const project = await createProject(t);
  await writeValidTracker(project.projectRoot);
  await recordScope(project.projectRoot, { ...confirmedScope(), status: "proposed" }, {
    now: new Date(timestamp),
  });
  const result = runValidator(["--manifest", project.manifestPath]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /full-manuscript validation requires a confirmed scope/);
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  assert.match(
    result.stdout,
    new RegExp(`scope_fingerprint=${manifest.current_scope.scope_fingerprint}`),
  );
  assert.match(result.stdout, /full_manuscript=false/);
});

test("scope fingerprints preserve author reading order independently of inventory sort order", async (t) => {
  const scope = confirmedScope();
  scope.files = [scope.files[1], scope.files[0]];
  const project = await confirmProject(t, scope);
  const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.notEqual(project.recorded.scope_fingerprint, expectedFingerprint);
});

test("scope fingerprints exclude record metadata and sort exclusions", async (t) => {
  const first = await createProject(t);
  const second = await createProject(t);
  for (const project of [first, second]) {
    await writeFile(
      path.join(project.projectRoot, "manuscript", "back-cover.png"),
      "back",
      "utf8",
    );
  }
  const proposed = {
    ...confirmedScope(),
    scope_id: "scope-a",
    description: "A proposed record with different metadata.",
    status: "proposed",
    excluded_files: ["manuscript/back-cover.png", "manuscript/cover.png"],
  };
  const confirmed = {
    ...confirmedScope(),
    scope_id: "scope-b",
    description: "A separate author-confirmed record.",
    created_at: "2026-11-05T02:00:00Z",
    excluded_files: ["manuscript/cover.png", "manuscript/back-cover.png"],
  };
  const firstResult = await recordScope(first.projectRoot, proposed, {
    now: new Date(timestamp),
  });
  const secondResult = await recordScope(second.projectRoot, confirmed, {
    authorConfirmation: {
      decision_id: "SCOPE-002",
      confirmed_at: "2026-11-05T03:00:00Z",
      reading_order_confirmed: true,
    },
    now: new Date("2026-11-05T03:00:00Z"),
  });
  assert.equal(firstResult.scope_fingerprint, secondResult.scope_fingerprint);
});

test("the neutral project template registers the v3.2 convergence state root", async () => {
  const template = JSON.parse(
    await readFile(
      path.join(root, "skills", "author-project", "assets", "project-template.json"),
      "utf8",
    ),
  );
  assert.equal(template.schema_version, "3.2.0");
  assert.equal(template.paths.convergence, ".author-toolkit/convergence/");
  assert.equal(validateManifest(template).valid, true);
});

test("recording a confirmed scope requires a valid author-confirmation reference", async (t) => {
  const { projectRoot } = await createProject(t);
  await assert.rejects(
    recordScope(projectRoot, confirmedScope(), {
      authorConfirmation: { confirmed_at: timestamp, reading_order_confirmed: true },
      now: new Date(timestamp),
    }),
    /decision_id|author.confirmation/i,
  );
});

test("full-manuscript validation enforces the closed snapshot schemas", async (t) => {
  const project = await confirmProject(t);
  const snapshot = JSON.parse(await readFile(project.recorded.snapshot_path, "utf8"));
  snapshot.unexpected = true;
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(project.recorded.snapshot_path, snapshotText, "utf8");
  project.manifest.current_scope.snapshot_sha256 = createHash("sha256")
    .update(snapshotText)
    .digest("hex");

  const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /additional properties/i.test(error.message)));
});

test("full-manuscript validation requires inventory evidence beneath the registered root", async (t) => {
  const project = await confirmProject(t);
  const alternate = path.join(project.projectRoot, "alternate-inventory.json");
  await copyFile(project.recorded.inventory_path, alternate);
  const snapshot = JSON.parse(await readFile(project.recorded.snapshot_path, "utf8"));
  snapshot.inventory.path = "alternate-inventory.json";
  const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(project.recorded.snapshot_path, snapshotText, "utf8");
  project.manifest.current_scope.snapshot_sha256 = createHash("sha256")
    .update(snapshotText)
    .digest("hex");

  const result = await validateFullManuscriptScope(project.manifest, project.manifestPath);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => /inventory snapshot path/.test(error.message)));
});

test("snapshot writes do not stale a project-root manuscript inventory", async (t) => {
  const project = await createProject(t);
  const initial = JSON.parse(await readFile(project.manifestPath, "utf8"));
  initial.manuscript_root = ".";
  initial.paths.convergence = "state/convergence";
  await writeFile(project.manifestPath, JSON.stringify(initial), "utf8");
  const scope = {
    ...confirmedScope(),
    excluded_files: [
      ".author-toolkit/project.json",
      "audit-tracker.md",
      "manuscript/cover.png",
      "story-bible.md",
    ],
  };
  await recordScope(project.projectRoot, scope, {
    authorConfirmation: authorConfirmation(),
    now: new Date(timestamp),
  });
  const manifest = JSON.parse(await readFile(project.manifestPath, "utf8"));
  const result = await validateFullManuscriptScope(manifest, project.manifestPath);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.match(manifest.current_scope.snapshot_path, /^state\/convergence\/scopes\//);
});

test("snapshot contracts reject unsafe paths, malformed identities, and unknown fields", async (t) => {
  const project = await confirmProject(t);
  const scope = JSON.parse(await readFile(project.recorded.snapshot_path, "utf8"));
  const inventory = JSON.parse(await readFile(project.recorded.inventory_path, "utf8"));

  const proposed = structuredClone(scope);
  proposed.status = "proposed";
  assert.equal(validateScopeSnapshot(proposed).valid, false);

  const unsafe = structuredClone(scope);
  unsafe.files[0].path = "../outside.md";
  assert.equal(validateScopeSnapshot(unsafe).valid, false);

  const malformed = structuredClone(scope);
  malformed.files[0].sha256 = "A".repeat(64);
  assert.equal(validateScopeSnapshot(malformed).valid, false);

  const missingIdentity = structuredClone(inventory);
  delete missingIdentity.inventory_fingerprint;
  assert.equal(validateInventorySnapshot(missingIdentity).valid, false);

  const additional = structuredClone(inventory);
  additional.unexpected = true;
  const result = validateInventorySnapshot(additional);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "additionalProperties"));
});
