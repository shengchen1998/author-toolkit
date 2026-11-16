import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "terminology.mjs");

function run(args) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("prints only the selected terminology section", () => {
  const result = run(["--section", "Core terms"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^## Core terms\n/);
  assert.match(result.stdout, /`strategy`/);
  assert.doesNotMatch(result.stdout, /## Writing rules|## Operation identifiers|## Contract values/);
});

test("prints multiple sections once in document order", () => {
  const result = run([
    "--section", "Contract values",
    "--section", "Core terms",
    "--section", "Contract values",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const core = result.stdout.indexOf("## Core terms");
  const contracts = result.stdout.indexOf("## Contract values");
  assert.ok(core === 0);
  assert.ok(contracts > core);
  assert.equal(result.stdout.indexOf("## Contract values", contracts + 1), -1);
  assert.doesNotMatch(result.stdout, /## Writing rules|## Operation identifiers/);
});

test("prints only setup-relevant rows with the setup preset", () => {
  const result = run(["--preset", "setup"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^## Core terms\n/);
  assert.match(result.stdout, /`user entry`/);
  assert.doesNotMatch(result.stdout, /host_visibility|host command visibility/);
  assert.match(result.stdout, /`current-draft revision convergence`/);
  assert.match(result.stdout, /Setup `setup\.installation`/);
  assert.match(result.stdout, /Pending action `status`/);
  assert.doesNotMatch(result.stdout, /`review coverage`|Coverage `coverage`|Evidence retention `mode`/);
  assert.doesNotMatch(result.stdout, /## Writing rules|## Operation identifiers/);

  const core = result.stdout.split("## Core terms\n")[1].split("\n## Contract values")[0];
  const contracts = result.stdout.split("## Contract values\n")[1];
  assert.equal(core.split("\n").filter((line) => line.startsWith("| `")).length, 27);
  assert.equal(contracts.split("\n").filter((line) => line.startsWith("| ")).length - 2, 6);
});

test("prints only reporting and routing rows with the setup-report preset", () => {
  const result = run(["--preset", "setup-report"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^## Core terms\n/);
  assert.doesNotMatch(result.stdout, /host_visibility|host command visibility/);
  assert.match(result.stdout, /`previous scope`/);
  assert.match(result.stdout, /`base scope`/);
  assert.match(result.stdout, /`execution receipt`/);
  assert.match(result.stdout, /`unverified approval`/);
  assert.match(result.stdout, /`current-draft revision convergence`/);
  assert.match(result.stdout, /Setup `setup\.installation`/);
  assert.match(result.stdout, /Approval `Status`/);
  assert.doesNotMatch(result.stdout, /`manuscript inventory`|`execution recovery audit`|`backup index inspection`/);
  assert.doesNotMatch(result.stdout, /`pending artifact index`|`input version`/);
  assert.doesNotMatch(result.stdout, /## Writing rules|## Operation identifiers/);

  const core = result.stdout.split("## Core terms\n")[1].split("\n## Contract values")[0];
  const contracts = result.stdout.split("## Contract values\n")[1];
  assert.equal(core.split("\n").filter((line) => line.startsWith("| `")).length, 12);
  assert.equal(contracts.split("\n").filter((line) => line.startsWith("| ")).length - 2, 6);
});

test("rejects unknown sections and invalid arguments", () => {
  const unknown = run(["--section", "Core terms", "--section", "Missing"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown terminology section: Missing/);
  assert.equal(unknown.stdout, "");

  for (const args of [
    [],
    ["--section"],
    ["Core terms"],
    ["--json"],
    ["--preset"],
    ["--preset", "missing"],
    ["--preset", "setup", "--preset", "setup"],
    ["--preset", "setup", "--section", "Core terms"],
    ["--section", "Core terms", "--preset", "setup"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stdout, /Usage:/);
  }
});

test("exposes help without reading terminology", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--section NAME/);
  assert.match(result.stdout, /--preset setup/);
  assert.match(result.stdout, /--preset setup-report/);
  assert.match(result.stdout, /writes nothing/);
});
