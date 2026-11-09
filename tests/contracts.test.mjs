import assert from "node:assert/strict";
import test from "node:test";

import {
  ReportEnvelopeError,
  extractReportEnvelope,
  validateFindingV1,
  validateFindingV2,
  validateManifest,
  validateMarkdownReport,
  validateProjectSchema,
  validateReportEnvelope,
  validateSchemaDefinitions,
} from "../scripts/lib/index.mjs";
import { clone, readManifest, readReport } from "./helpers.mjs";

function findingV2() {
  return {
    id: "STRUCT-001",
    audit: "story-structure-audit",
    technique: "Weiland Midpoint",
    severity: "warning",
    location: {
      file: "manuscript/chapter-02.md",
      scope: "chapter",
      chapter: 2,
    },
    issue: "The revelation does not change the protagonist's action.",
    recommendation: "Choose a consequential midpoint action before revising prose.",
    confidence: "judgment",
  };
}

test("all schema definitions compile as draft 2020-12", () => {
  assert.equal(validateSchemaDefinitions().valid, true);
});

test("the unchanged v1 contract still accepts a legacy finding", () => {
  const legacy = {
    audit: "developmental-editing",
    technique: "Scene goal-conflict-outcome",
    severity: "suggestion",
    location: {
      file: "manuscript/chapter-01.md",
      line: 8,
      quote: "The old text remains addressable by line.",
    },
    issue: "The scene outcome is unclear.",
    confidence: "judgment",
  };

  assert.equal(validateFindingV1(legacy).valid, true);
  assert.equal(validateFindingV2(legacy).valid, false);
});

test("v2 accepts chapter and passage locations without fabricated line numbers", () => {
  const chapterFinding = findingV2();
  assert.equal(validateFindingV2(chapterFinding).valid, true);

  const passageFinding = clone(chapterFinding);
  passageFinding.location = {
    file: "manuscript/chapter-02.md",
    scope: "passage",
    chapter: 2,
    quote: "A quoted passage can be located without a synthetic line 1.",
  };
  assert.equal(validateFindingV2(passageFinding).valid, true);
});

test("v2 rejects a finding without a recommendation", () => {
  const finding = findingV2();
  delete finding.recommendation;
  const result = validateFindingV2(finding);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (error) => error.keyword === "required" && error.params.missingProperty === "recommendation",
    ),
  );
});

test("v2 rejects a synthetic line attached to chapter scope and malformed IDs", () => {
  const finding = findingV2();
  finding.location.line = 1;
  finding.id = "structure-1";
  const result = validateFindingV2(finding);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.instancePath === "/id"));
  assert.ok(result.errors.some((error) => error.instancePath === "/location/line"));
});

test("both example manifests satisfy the v3.1 project schema", async () => {
  for (const language of ["en", "zh"]) {
    const result = validateManifest(await readManifest(language));
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
  }
});

test("project paths reject absolute, parent, and home expansion forms", async (t) => {
  const cases = [
    ["absolute POSIX", "/tmp/reports"],
    ["parent segment", "../reports"],
    ["embedded parent segment", "manuscript/../../reports"],
    ["home expansion", "~/reports"],
    ["Windows drive", "C:\\reports"],
  ];

  for (const [name, value] of cases) {
    await t.test(name, async () => {
      const manifest = await readManifest();
      manifest.paths.reports = value;
      const result = validateProjectSchema(manifest);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.instancePath === "/paths/reports"));
    });
  }
});

test("both localized reports validate and cover the two engine names", async () => {
  const english = validateMarkdownReport(await readReport("en"));
  const chinese = validateMarkdownReport(await readReport("zh"));

  assert.equal(english.valid, true);
  assert.equal(chinese.valid, true);
  assert.equal(english.envelope.engine.name, "conversational");
  assert.equal(chinese.envelope.engine.name, "scriptorium");
});

test("report envelopes reject additional fields and nested legacy findings", async () => {
  const { envelope } = validateMarkdownReport(await readReport());

  const additional = clone(envelope);
  additional.fixture = true;
  assert.equal(validateReportEnvelope(additional).valid, false);

  const badFinding = clone(envelope);
  delete badFinding.findings[0].recommendation;
  const result = validateReportEnvelope(badFinding);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.instancePath.startsWith("/findings/0")));

  const legacyFinding = clone(envelope);
  legacyFinding.findings[0] = {
    audit: "developmental-editing",
    technique: "Scene causality",
    severity: "note",
    location: { file: "chapter.md", line: 1, quote: "Legacy" },
    issue: "This v1 finding lacks v2 fields.",
    confidence: "judgment",
  };
  assert.equal(validateReportEnvelope(legacyFinding).valid, false);
});

test("v3.1 requires seven operational paths and a fiction-only manifest", async () => {
  const empty = await readManifest();
  empty.paths = {};
  const emptyResult = validateProjectSchema(empty);
  assert.equal(emptyResult.valid, false);
  assert.deepEqual(
    new Set(
      emptyResult.errors
        .filter((error) => error.keyword === "required")
        .map((error) => error.params.missingProperty),
    ),
    new Set(["story_bible", "audit_tracker", "reports", "sessions", "backups", "handoffs", "creation"]),
  );

  const missingBackups = await readManifest();
  delete missingBackups.paths.backups;
  const backupsResult = validateProjectSchema(missingBackups);
  assert.equal(backupsResult.valid, false);
  assert.ok(
    backupsResult.errors.some(
      (error) => error.keyword === "required" && error.params.missingProperty === "backups",
    ),
  );

  const nonfiction = await readManifest();
  nonfiction.project_type = "narrative-nonfiction";
  assert.equal(validateProjectSchema(nonfiction).valid, false);

  const blueprint = await readManifest();
  blueprint.paths.book_blueprint = "book-blueprint.md";
  assert.equal(validateProjectSchema(blueprint).valid, false);
});

test("finding IDs accept the thousandth finding but still require at least three digits", () => {
  const finding = findingV2();
  finding.id = "STRUCT-1000";
  assert.equal(validateFindingV2(finding).valid, true);

  finding.id = "STRUCT-01";
  assert.equal(validateFindingV2(finding).valid, false);
});

test("report input paths reject non-portable and escaping locations", async (t) => {
  const { envelope } = validateMarkdownReport(await readReport());
  const cases = [
    ["absolute POSIX", "/tmp/chapter.md"],
    ["parent segment", "../chapter.md"],
    ["embedded parent segment", "manuscript/../../chapter.md"],
    ["home expansion", "~/chapter.md"],
    ["URI scheme", "https://example.com/chapter.md"],
    ["Windows drive", "C:\\chapter.md"],
    ["backslash separator", "manuscript\\chapter.md"],
  ];

  for (const [name, value] of cases) {
    await t.test(name, () => {
      const report = clone(envelope);
      report.inputs[0].path = value;
      const result = validateReportEnvelope(report);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.instancePath === "/inputs/0/path"));
    });
  }
});

test("Markdown reports require parsed language coverage and a matching engine summary", async () => {
  for (const language of ["en", "zh"]) {
    const markdown = await readReport(language);
    const result = validateMarkdownReport(markdown);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true);
    assert.equal(result.envelope.skill.version, "unversioned");
    assert.equal(result.envelope.engine.version, "unknown");
  }

  const english = await readReport();
  const withoutHeading = english.replace("## Language coverage\n", "");
  const missing = validateMarkdownReport(withoutHeading);
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((error) => error.keyword === "language-coverage"));

  const duplicate = validateMarkdownReport(
    english.replace(
      "## Language coverage\n",
      "## Language coverage\n\n## Language coverage\n",
    ),
  );
  assert.equal(duplicate.valid, false);
  assert.match(
    duplicate.errors.find((error) => error.keyword === "language-coverage").message,
    /found 2/,
  );

  const fencedOnly = validateMarkdownReport(
    `${withoutHeading}\n\`\`\`text\n## Language coverage\n\`\`\`\n`,
  );
  assert.equal(fencedOnly.valid, false);

  const naturalSummary = validateMarkdownReport(
    english.replace(
      /Coverage: full - [^"\n]+/,
      "Full three-chapter and Story Bible coverage; no fallback",
    ),
  );
  assert.equal(naturalSummary.valid, true);

  const withoutSummary = validateMarkdownReport(
    english.replace(/Coverage: full - [^"\n]+/, "No coverage summary"),
  );
  assert.equal(withoutSummary.valid, false);
  assert.ok(
    withoutSummary.errors.some(
      (error) => error.keyword === "language-coverage" && error.instancePath === "/engine/notes",
    ),
  );
});

test("Markdown extraction rejects zero, multiple, malformed, and unclosed JSON blocks", async () => {
  const report = await readReport();
  const envelope = extractReportEnvelope(report);

  assert.throws(() => extractReportEnvelope("# Explanation only"), ReportEnvelopeError);
  assert.throws(
    () => extractReportEnvelope(`${report}\n\n\`\`\`json\n{}\n\`\`\`\n`),
    /found 2/,
  );
  assert.throws(() => extractReportEnvelope("```json\n{not json}\n```"), /not valid JSON/);
  assert.throws(() => extractReportEnvelope("```json\n{}"), /no closing fence/);

  const withOtherCode = `# Notes\n\`\`\`text\nnot an envelope\n\`\`\`\n${report}`;
  assert.deepEqual(extractReportEnvelope(withOtherCode), envelope);
  assert.equal(validateMarkdownReport("# No envelope").valid, false);
});
