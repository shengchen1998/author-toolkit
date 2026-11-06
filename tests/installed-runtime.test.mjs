import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

test(
  "real generic installation passes the isolated installed-runtime smoke",
  { timeout: 120000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "smoke-installed-runtime.mjs")],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Installed runtime smoke passed/);
  },
);
