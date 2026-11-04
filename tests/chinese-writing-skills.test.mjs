import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { root } from "./helpers.mjs";

function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("fiction workshop loads its Chinese line reference and scopes English length guidance", async () => {
  const skill = await read("skills/fiction-workshop/SKILL.md");

  assert.match(
    skill,
    /Chinese line editing \(`language=zh\*` or an actually Chinese manuscript\) → `references\/chinese-line-editing\.md`/,
  );
  assert.match(
    skill,
    /must load `references\/chinese-line-editing\.md` instead of `references\/line-editing\.md`/,
  );
  assert.match(
    skill,
    /Chinese developmental editing, character work, and continuity tracking keep their existing references and workflow/,
  );
  assert.match(skill, /English guideline only: < 2,000 words/);
  assert.match(skill, /author-approved character count or another author-approved length unit/);
  assert.match(skill, /Do not derive a Chinese threshold through a fixed English-word conversion/);
  assert.doesNotMatch(skill, /\(< 2,000 words\)/);
});

test("Chinese fiction line editing covers language forms with punctuation and context guards", async () => {
  const reference = await read(
    "skills/fiction-workshop/references/chinese-line-editing.md",
  );

  for (const pattern of [
    /结合场景目的、叙述视角、人物声音、语体和上下文/,
    /被、由、让/,
    /着、了、过/,
    /正在、已经、曾经、将要/,
    /对话提示语与“说／道”/,
    /“明天再走。”他说。/,
    /感知过滤词/,
    /副词与弱动词/,
    /程度副词和方式副词/,
    /重复与节奏/,
    /中文标点与段落/,
    /引号“”与‘’、破折号——、省略号……/,
    /`said`、cut `that`、`I`\/`The` 句首或 `-ly`/,
    /主动句并非总是优于被动句/,
    /展示并非总是优于叙述/,
  ]) {
    assert.match(reference, pattern);
  }
});

test("author review maps English standards terms to Chinese checks and honest coverage", async () => {
  const [skill, checklists, reference, handoff] = await Promise.all([
    read("skills/author-review/SKILL.md"),
    read("skills/author-review/references/checklists.md"),
    read("skills/author-review/references/chinese-writing-standards.md"),
    read("skills/author-review/assets/review-handoff-template.md"),
  ]);

  for (const text of [skill, checklists]) {
    assert.match(text, /language=zh\*/);
    assert.match(text, /chinese-writing-standards\.md/);
    assert.match(text, /actual(?:ly)? Chinese manuscript/);
  }
  assert.match(skill, /do not give it to the intent or fresh-reader perspectives/);
  assert.match(skill, /`Review coverage` tied to actual manuscript units and syntheses/);
  assert.match(handoff, /Standards: [^\n]*chinese-writing-standards\.md/);
  assert.doesNotMatch(handoff, /Intent: [^\n]*chinese-writing-standards\.md/);
  assert.doesNotMatch(handoff, /Fresh: [^\n]*chinese-writing-standards\.md/);

  for (const pattern of [
    /`passive` \| 被、由、让、为……所……/,
    /`tense` \| 着、了、过与时间表达/,
    /`filter words` \| .*感知表达/,
    /`adverbs` \| “地”结构、程度副词、方式副词/,
    /`sticky constructions` \| 的链、名词化、进行／给予／作出及功能词堆叠/,
    /每项标为 `full`、`partial` 或 `skipped`/,
    /任何中文子检查缺失时，不得把中文 standards 的整体语言覆盖称为 `full`/,
  ]) {
    assert.match(reference, pattern);
  }
});

test("narrative nonfiction loads Chinese voice guidance and separates length units", async () => {
  const [skill, reference, template] = await Promise.all([
    read("skills/narrative-nonfiction/SKILL.md"),
    read("skills/narrative-nonfiction/references/chinese-voice-and-content.md"),
    read("skills/narrative-nonfiction/assets/chapter-template.md"),
  ]);

  assert.match(skill, /Voice Editor or Content Editor work with `language=zh\*`/);
  assert.match(skill, /actually Chinese manuscript/);
  assert.match(skill, /references\/chinese-voice-and-content\.md/);

  for (const pattern of [
    /读者称呼：你、我们、大家与敬称/,
    /语体与作者声音/,
    /连接与论证推进/,
    /名词化与功能词/,
    /比喻与概念表达/,
    /练习措辞与可执行性/,
    /`you`／`we`／`one`/,
    /被动句也可以合理保留/,
  ]) {
    assert.match(reference, pattern);
  }

  assert.match(template, /English example only: ~3,000-5,000 words/);
  assert.match(template, /no universal Chinese character target or fixed word conversion/);
  assert.match(template, /\*Target Chinese character count \(author-approved\): ____\*/);
  assert.match(template, /\*Actual Chinese character count: ____\*/);
});

test("story structure supports Chinese length measures without hard percentage targets", async () => {
  const audit = await read("skills/story-structure/references/structure-audit.md");

  assert.match(
    audit,
    /For a Chinese manuscript, use an author-approved character count or chapter count/,
  );
  assert.match(audit, /rather than converting Chinese text into English words/);
  assert.match(audit, /All resulting percentages are rough placement guides, not targets to enforce/);
});
