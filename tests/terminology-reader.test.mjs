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
  assert.match(result.stdout, /`host command visibility`/);
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

test("rejects unknown sections and invalid arguments", () => {
  const unknown = run(["--section", "Core terms", "--section", "Missing"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /unknown terminology section: Missing/);
  assert.equal(unknown.stdout, "");

  for (const args of [[], ["--section"], ["Core terms"], ["--json"]]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stdout, /Usage:/);
  }
});

test("exposes help without reading terminology", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--section NAME/);
  assert.match(result.stdout, /writes nothing/);
});
