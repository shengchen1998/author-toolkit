import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("all 19 prose audits have explicit Chinese procedures and loading rules", async () => {
  const [skill, support, rules] = await Promise.all([
    read("skills/prose-mechanics/SKILL.md"),
    read("skills/prose-mechanics/references/language-support.md"),
    read("skills/prose-mechanics/references/chinese-rules.md"),
  ]);

  const audits = [...skill.matchAll(/^\| (\d+) \| ([^|]+?) \|/gm)].map(([ , number, name]) => ({
    number: Number(number),
    name: name.trim().replace(/ \(file:.*\)$/, ""),
  }));
  assert.equal(audits.length, 19);
  for (const [index, audit] of audits.entries()) {
    assert.equal(audit.number, index + 1);
    assert.match(support, new RegExp(`\\| ${audit.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|`));
    assert.match(rules, new RegExp(`^## ${audit.number}\\. `, "m"));
  }

  assert.match(skill, /references\/chinese-rules\.md/);
  assert.match(skill, /explicitly documents Chinese support/);
  assert.match(support, /every requested subcheck/i);
  assert.match(support, /does not mean that an English metric was translated/i);
});

test("Chinese prose rules cover segmentation, grammar, catalogs, and punctuation context", async () => {
  const rules = await read("skills/prose-mechanics/references/chinese-rules.md");

  for (const pattern of [
    /按中文边界分句/,
    /声明计数单位/,
    /segmentation=conversational/,
    /被`、`由`、`让`/,
    /着、了、过/,
    /“…”/,
    /看见、看到、听见、听到/,
    /心中一凛、心头一震/,
    /Flesch-Kincaid[\s\S]*inapplicable to Chinese/,
    /不使用英文替换表、英文词数密度、Title Case/,
    /confidence: judgment/,
  ]) {
    assert.match(rules, pattern);
  }
});
