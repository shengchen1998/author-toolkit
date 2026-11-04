import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

const [adapter, catalog, upstream] = await Promise.all([
  readFile(path.join(root, "references/avoid-ai-writing-adapter.md"), "utf8"),
  readFile(path.join(root, "references/avoid-ai-writing-zh-CN.md"), "utf8"),
  readFile(path.join(root, "skills/avoid-ai-writing/SKILL.md"), "utf8"),
]);

test("the adapter references the local Chinese catalog", () => {
  assert.match(adapter, /\]\(avoid-ai-writing-zh-CN\.md\)/);
  assert.match(adapter, /Chinese spans use every `ZH-01` through `ZH-12` category/);
  assert.match(catalog, /^# 中文 AI 写作候选模式 Catalog$/m);
});

test("every Chinese category has an executable audit structure", () => {
  const ids = [...catalog.matchAll(/^## (ZH-\d{2}) /gm)].map((match) => match[1]);
  assert.deepEqual(ids, [
    "ZH-01",
    "ZH-02",
    "ZH-03",
    "ZH-04",
    "ZH-05",
    "ZH-06",
    "ZH-07",
    "ZH-08",
    "ZH-09",
    "ZH-10",
    "ZH-11",
    "ZH-12",
  ]);

  for (const heading of ["候选信号", "上下文判断", "合理例外", "中文例子与修改方向"]) {
    const sections = catalog.match(new RegExp(`^### ${heading}$`, "gm")) ?? [];
    assert.equal(sections.length, 12, `${heading} is present for every category`);
  }
  assert.match(catalog, /每个类别都要读完整个中文 span/);
});

test("Chinese full, partial, and skipped coverage reflect actual execution", () => {
  assert.match(adapter, /`full` only after every category and span is actually evaluated/);
  assert.match(adapter, /complete conversational Chinese run may set `engine\.degraded` to `false`/);
  assert.match(adapter, /Missing a category, skipping a requested span/);
  assert.match(adapter, /`partial` names each covered file and span/);
  assert.match(adapter, /`skipped` means the requested pass was not executed/);
  assert.match(adapter, /Scriptorium's English-only analysis must not be reported as Chinese coverage/);
});

test("mixed text keeps language paths separate when upstream is unavailable", () => {
  assert.match(
    adapter,
    /Mixed English and Chinese \| Run upstream on English spans and the local catalog on Chinese spans/,
  );
  assert.match(adapter, /Pure Chinese detection and rewriting do not resolve or invoke upstream/);
  assert.match(adapter, /English-only requested operation is blocked with `skipped` coverage/);
  assert.match(adapter, /still complete the local Chinese spans/);
  assert.match(adapter, /whole requested operation as `partial` and degraded/);
});

test("priority is revision urgency and Chinese matches never assert provenance", () => {
  assert.match(adapter, /P0 to `warning`, P1 to `suggestion`, P2 to `note`/);
  assert.match(adapter, /P0\/P1\/P2 express revision priority, not AI probability/);
  assert.match(adapter, /Every Chinese finding uses `confidence: "judgment"`/);
  assert.match(adapter, /A string match can locate text but cannot prove AI origin/);
  assert.match(adapter, /does not determine whether text was AI-generated, identify its author/);
  assert.match(catalog, /所有中文 finding 的 `confidence` 都是 `judgment`/);
  assert.match(catalog, /不推断作者身份，不断言文本由 AI 或人类生成/);
});

test("findings require real excerpts and contextual recommendations", () => {
  assert.match(adapter, /a short verbatim excerpt from the manuscript/);
  assert.match(adapter, /a specific `reason` explaining the problem in context/);
  assert.match(adapter, /an actionable `recommendation`/);
  assert.match(adapter, /Never invent facts, sources, or replacements/);
  assert.match(catalog, /原文连续短 excerpt/);
});

test("Chinese punctuation and typography are protected from English rules", () => {
  assert.match(catalog, /中文破折号 `——`、引号 `“”` 与 `‘’`、省略号 `……`/);
  assert.match(catalog, /绝不应用 upstream 的英文 em-dash 清零目标/);
  assert.match(catalog, /绝不应用英文词数密度、英文句长带、title case 或英文替换表/);
  assert.match(catalog, /不得因为出现 `——` 就报 finding/);
  assert.match(catalog, /中文标题不存在英文 title-case 检查/);
});

test("rewrites retain approvals, backups, immutable reports, and a full second pass", () => {
  assert.match(adapter, /Obtain explicit author approval for that change batch/);
  assert.match(adapter, /complete `author-project` backup for every affected file/);
  assert.match(adapter, /Run a separate second detection pass over the resulting text/);
  assert.match(adapter, /Re-scan every rewritten Chinese span against all `ZH-01` through `ZH-12`/);
  assert.match(adapter, /Write a new immutable report with remaining findings/);
  assert.match(catalog, /改写后独立二次检测/);
  assert.match(catalog, /重新执行全部 12 类/);
});

test("standalone Chinese AI-Isms uses prose-mechanics without extending upstream", () => {
  assert.match(adapter, /route a standalone Chinese AI-writing audit to `prose-mechanics` AI-Isms/);
  assert.match(adapter, /retains finding v1/);
  assert.match(adapter, /independent upstream `avoid-ai-writing` run remains English-only/);
  assert.match(adapter, /local catalog does not alter or extend that upstream skill/);
});

test("the vendored upstream skill contains no local Chinese integration", () => {
  assert.doesNotMatch(upstream, /avoid-ai-writing-(?:adapter|zh-CN)\.md/);
  assert.doesNotMatch(upstream, /[\u3400-\u9fff]/);
});
