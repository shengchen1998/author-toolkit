import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { root } from "./helpers.mjs";

const tool = path.join(root, "scripts", "range.mjs");

function run(args, options = {}) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
  });
}

async function fixture(t, files) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const projectRoot = await mkdtemp(path.join(output, "range-"));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(projectRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return projectRoot;
}

test("resolves a 1-based inclusive character range in Chinese text", async (t) => {
  const projectRoot = await fixture(t, {
    "manuscript/1.md": "第一行\n温暖与热带的风\n第三行\n",
  });
  const result = run(["--project-root", projectRoot, "manuscript/1.md:2:3-4"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "manuscript/1.md:2:3-4\n与热\n");
});

test("supports a single character and a JSON result", async (t) => {
  const projectRoot = await fixture(t, {
    "manuscript/1.md": "第一行\n温暖与热带的风\n",
  });
  const single = run(["--project-root", projectRoot, "manuscript/1.md:2:3"]);
  assert.equal(single.status, 0, single.stderr);
  assert.equal(single.stdout, "manuscript/1.md:2:3\n与\n");

  const json = run(["--project-root", projectRoot, "--json", "manuscript/1.md:2:3-4"]);
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    path: "manuscript/1.md",
    line: 2,
    start: 3,
    end: 4,
    text: "与热",
    line_length: 7,
  });
});

test("counts Unicode code points and handles CRLF and a leading BOM", async (t) => {
  const projectRoot = await fixture(t, {
    "manuscript/emoji.md": "a😀b\r\nsecond\r\n",
    "manuscript/bom.md": String.fromCodePoint(0xfeff) + "abc" + String.fromCharCode(10),
  });
  const emoji = run(["--project-root", projectRoot, "manuscript/emoji.md:1:2-2"]);
  assert.equal(emoji.status, 0, emoji.stderr);
  assert.equal(emoji.stdout, "manuscript/emoji.md:1:2\n😀\n");

  const crlf = run(["--project-root", projectRoot, "manuscript/emoji.md:2:1-6"]);
  assert.equal(crlf.status, 0, crlf.stderr);
  assert.equal(crlf.stdout, "manuscript/emoji.md:2:1-6\nsecond\n");

  const bom = run(["--project-root", projectRoot, "manuscript/bom.md:1:1-3"]);
  assert.equal(bom.status, 0, bom.stderr);
  assert.equal(bom.stdout, "manuscript/bom.md:1:1-3\nabc\n");
});

test("does not invent a line after a trailing newline", async (t) => {
  const projectRoot = await fixture(t, { "manuscript/1.md": "one\ntwo\n" });
  const outside = run(["--project-root", projectRoot, "manuscript/1.md:3:1-1"]);
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /line 3 is outside/);
});

test("rejects out-of-range and reversed ranges", async (t) => {
  const projectRoot = await fixture(t, { "manuscript/1.md": "short\n" });
  const outOfRange = run(["--project-root", projectRoot, "manuscript/1.md:1:1-9"]);
  assert.equal(outOfRange.status, 1);
  assert.match(outOfRange.stderr, /character range 1-9 is outside line 1/);

  const reversed = run(["--project-root", projectRoot, "manuscript/1.md:1:4-2"]);
  assert.equal(reversed.status, 2);
  assert.match(reversed.stderr, /start must not exceed/);
});

test("rejects non-relative paths, invalid locations, and missing files", async (t) => {
  const projectRoot = await fixture(t, { "manuscript/1.md": "text\n" });
  const absolute = run(["--project-root", projectRoot, "/etc/passwd:1:1"]);
  assert.equal(absolute.status, 2);
  assert.match(absolute.stderr, /project-relative/);

  const escaping = run(["--project-root", projectRoot, "../outside.md:1:1"]);
  assert.equal(escaping.status, 2);
  assert.match(escaping.stderr, /project-relative/);

  const invalid = run(["--project-root", projectRoot, "manuscript/1.md:0:1"]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /line must be a positive integer/);

  const missing = run(["--project-root", projectRoot, "manuscript/missing.md:1:1"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /cannot read manuscript\/missing\.md/);
});

test("rejects incomplete arguments", () => {
  const missing = run([]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /LOCATION is required/);

  const extra = run(["manuscript/1.md:1:1", "extra"]);
  assert.equal(extra.status, 2);
  assert.match(extra.stderr, /unexpected extra argument/);

  const projectRoot = run(["--project-root"]);
  assert.equal(projectRoot.status, 2);
  assert.match(projectRoot.stderr, /--project-root requires a directory/);

  const format = run(["manuscript/1.md:1"]);
  assert.equal(format.status, 2);
  assert.match(format.stderr, /path:line:start/);
});

test("uses the current directory by default and exposes help", async (t) => {
  const projectRoot = await fixture(t, { "manuscript/1.md": "abc\n" });
  const result = run(["manuscript/1.md:1:2-3"], { cwd: projectRoot });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "manuscript/1.md:1:2-3\nbc\n");

  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage:/);
  assert.match(help.stdout, /1-based and\s+inclusive/);
  assert.match(help.stdout, /Unicode code points/);
});
