import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

test("tracked pre-commit hook runs fast validation and focused contracts", {
  timeout: 240000,
}, async () => {
  const hook = path.join(root, ".githooks", "pre-commit");
  const metadata = await stat(hook);
  assert.ok(metadata.mode & 0o111, "the hook is executable");

  const tracked = spawnSync("git", ["ls-files", "--stage", "--", ".githooks/pre-commit"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.match(tracked.stdout, /^100755 [a-f0-9]{40} 0\t\.githooks\/pre-commit\n$/);

  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(hook, [], {
    cwd: path.join(root, "scripts"),
    encoding: "utf8",
    env: environment,
    timeout: 240000,
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  const responseText = result.stdout.match(/^\{\n[\s\S]*?^\}/m)?.[0];
  assert.ok(responseText, output);
  const response = JSON.parse(responseText);
  assert.equal(response.valid, true);
  assert.equal(response.result.checks, 11);
  assert.deepEqual(response.errors, []);
  assert.match(output, /Generated runtime artifacts are current/);
  assert.match(output, /# pass [1-9][0-9]*/);
  assert.match(output, /# fail 0/);
});
