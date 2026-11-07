import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateScopeCurrency } from "../scripts/lib/index.mjs";
import { root } from "./helpers.mjs";

const timestamp = "2026-11-04T00:00:00Z";

test("a million Chinese characters scale without importing creation state as manuscript", async (t) => {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(output, "million-zh-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));

  const chapterCount = 250;
  const chapterText = "宁".repeat(4000);
  const files = [];
  await mkdir(path.join(temporary, "manuscript"), { recursive: true });
  for (let index = 1; index <= chapterCount; index += 1) {
    const name = `chapter-${String(index).padStart(3, "0")}.md`;
    const relativePath = `manuscript/${name}`;
    const contents = `# 第 ${index} 章\n\n${chapterText}\n`;
    await writeFile(path.join(temporary, relativePath), contents, "utf8");
    files.push({
      path: relativePath,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
  }
  const creationState = path.join(temporary, ".author-toolkit", "creation", "state", "current.md");
  await mkdir(path.dirname(creationState), { recursive: true });
  await writeFile(creationState, "# Current story state\n", "utf8");
  const manifestPath = path.join(temporary, ".author-toolkit", "project.json");
  const manifest = {
    schema_version: "4.0.0",
    language: "zh-CN",
    created_at: timestamp,
    updated_at: timestamp,
    manuscript_root: ".",
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
    current_scope: {
      scope_id: "scope-million",
      description: "Synthetic million-character inventory.",
      status: "confirmed",
      files,
      excluded_files: [],
      created_at: timestamp,
    },
  };

  assert.equal((await validateScopeCurrency(manifest, manifestPath)).valid, true);
  await writeFile(path.join(temporary, "manuscript", "chapter-251.md"), "新的章节", "utf8");
  const added = await validateScopeCurrency(manifest, manifestPath);
  assert.equal(added.valid, false);
  assert.ok(added.errors.some((error) => error.message.includes("chapter-251.md")));
});
