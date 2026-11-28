import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { validateDraftBaseline } from "../scripts/lib/index.mjs";
import { exampleRoot, root } from "./helpers.mjs";

const validator = path.join(root, "scripts", "validate.mjs");
const INFERRED_HEADINGS = "| Source ID | Interpretation | Evidence paths | Alternative or uncertainty | Author decision |\n|---|---|---|---|---|";
const UNKNOWN_HEADINGS = "| Source ID | Topic | Current status | Effect on current-text diagnosis |\n|---|---|---|---|";
const REVIEW_HEADINGS = "| Assertion ID | Drafted observed assertion | Manuscript path and line or short passage, or no direct support | Disposition | Resulting statement or destination |\n|---|---|---|---|---|";
const CHAPTER_ORDER_SUBSECTION = "Chapter order and manuscript events";
const LEGACY_CHAPTER_ORDER_SUBSECTION = "Chapter order and current turning points";
const OBSERVED_SUBSECTIONS = [
  "Premise and current conflict",
  "Principal characters and current choices",
  "Current arc trends",
  "World facts and timeline constraints",
  CHAPTER_ORDER_SUBSECTION,
];

function defaultReview() {
  return [
    "| O-001 | The meeting lasts three days. | `manuscript/1.md:3` | keep | — |",
    "| O-002 | Today is the first meeting day. | No direct support for first day. | revise | She returned at 18:00. |",
    "| O-003 | The object was left deliberately. | `manuscript/1.md:13` | move to Inferred from the text | The object may have been left deliberately. |",
    "| O-004 | Today is the first meeting day. | No direct support. | move to Unknown or unwritten | The current meeting day |",
  ];
}

function fixture(overrides = {}) {
  const values = {
    observed: [
      "- [O-001] The meeting lasts three days. (`manuscript/1.md:3`)",
      "- [O-002] She returned at 18:00. (`manuscript/1.md:5`)",
    ],
    observedHeadings: OBSERVED_SUBSECTIONS,
    inferred: [
      "| O-003 | The object may have been left deliberately. | `manuscript/1.md:13` | It may be unrelated. | Undecided |",
      "| — | The attendant may return. | `manuscript/1.md:5` | The scene may end here. | Undecided |",
    ],
    unknown: [
      "| O-004 | The current meeting day | Unwritten | Does not block diagnosis |",
      "| — | The ending | Unwritten | Does not block diagnosis |",
    ],
    review: defaultReview(),
    ...overrides,
  };
  return `# Draft Baseline

## Observed in the text

${values.observedHeadings.map((heading, index) => `### ${heading}\n\n${index === 0 ? values.observed.join("\n") : ""}`).join("\n\n")}

## Inferred from the text

${INFERRED_HEADINGS}
${values.inferred.join("\n")}

## Unknown or unwritten

${UNKNOWN_HEADINGS}
${values.unknown.join("\n")}

## Source-fidelity review

${REVIEW_HEADINGS}
${values.review.join("\n")}
`;
}

function messages(markdown) {
  return validateDraftBaseline(markdown).errors.map((error) => error.message).join("\n");
}

function runValidator(args, cwd = root) {
  return spawnSync(process.execPath, [validator, ...args], { cwd, encoding: "utf8" });
}

async function temporaryDirectory(t) {
  const output = path.join(root, ".test-output");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(path.join(output, "draft-baseline-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("draft baseline validation accepts keep, revise, moves, and directly drafted destination rows", () => {
  const result = validateDraftBaseline(fixture());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("draft baseline validation requires every template subsection within Observed in the text", () => {
  for (const heading of OBSERVED_SUBSECTIONS) {
    const missing = fixture({
      observedHeadings: OBSERVED_SUBSECTIONS.filter((candidate) => candidate !== heading),
    });
    assert.equal(validateDraftBaseline(missing).valid, false);
    assert.match(messages(missing), new RegExp(`expected exactly one ### ${heading} subsection; found 0`));
  }

  const duplicate = fixture({
    observedHeadings: [...OBSERVED_SUBSECTIONS, OBSERVED_SUBSECTIONS[0]],
  });
  assert.equal(validateDraftBaseline(duplicate).valid, false);
  assert.match(messages(duplicate), /expected exactly one ### Premise and current conflict subsection; found 2/);

  const heading = "Current arc trends";
  const misplaced = fixture({
    observedHeadings: OBSERVED_SUBSECTIONS.filter((candidate) => candidate !== heading),
  }).replace("## Inferred from the text", `## Inferred from the text\n\n### ${heading}`);
  assert.equal(validateDraftBaseline(misplaced).valid, false);
  assert.match(messages(misplaced), /expected exactly one ### Current arc trends subsection; found 0/);
});

test("draft baseline validation accepts the legacy chapter-order alias only when it is unique", () => {
  const legacy = fixture({
    observedHeadings: OBSERVED_SUBSECTIONS.map((heading) => (
      heading === CHAPTER_ORDER_SUBSECTION ? LEGACY_CHAPTER_ORDER_SUBSECTION : heading
    )),
  });
  assert.equal(validateDraftBaseline(legacy).valid, true, messages(legacy));

  const duplicate = fixture({
    observedHeadings: [...OBSERVED_SUBSECTIONS, LEGACY_CHAPTER_ORDER_SUBSECTION],
  });
  assert.equal(validateDraftBaseline(duplicate).valid, false);
  assert.match(messages(duplicate), /expected exactly one ### Chapter order and manuscript events subsection; found 2 \(legacy alias: ### Chapter order and current turning points\)/);
});

test("draft baseline validation reports missing and duplicate review rows", () => {
  const missing = fixture({ review: defaultReview().filter((row) => !row.startsWith("| O-002")) });
  assert.equal(validateDraftBaseline(missing).valid, false);
  assert.match(messages(missing), /missing review row for O-002/);

  const duplicate = fixture({ review: [...defaultReview(), defaultReview()[0]] });
  assert.equal(validateDraftBaseline(duplicate).valid, false);
  assert.match(messages(duplicate), /duplicate review row for O-001/);
});

test("draft baseline validation rejects a move without its recorded destination", () => {
  const markdown = fixture({ inferred: [] });
  const result = validateDraftBaseline(markdown);
  assert.equal(result.valid, false);
  assert.match(messages(markdown), /reviewed assertion O-003 has no recorded destination/);
  assert.doesNotMatch(messages(markdown), /missing review row for O-004/);
});

test("draft baseline validation checks disposition locations and revision results", () => {
  const wrongDestination = fixture({
    review: defaultReview().map((row) => row.startsWith("| O-003")
      ? row.replace("move to Inferred from the text", "move to Unknown or unwritten")
      : row),
  });
  assert.match(messages(wrongDestination), /move to Unknown or unwritten does not match the recorded location Inferred from the text/);

  const missingResult = fixture({
    review: defaultReview().map((row) => row.startsWith("| O-002")
      ? row.replace(/She returned at 18:00\. \|$/, "— |")
      : row),
  });
  assert.match(messages(missingResult), /revise and move require a resulting statement or destination/);

  const unsupported = fixture({
    review: defaultReview().map((row) => row.startsWith("| O-001")
      ? row.replace("| keep |", "| drop |")
      : row),
  });
  assert.match(messages(unsupported), /unsupported disposition: drop/);
});

test("draft baseline validation requires identified single-line observed assertions and unique final IDs", () => {
  const unidentified = fixture({ observed: ["- The meeting lasts three days."] });
  assert.match(messages(unidentified), /each assertion must be one single-line bullet/);

  const duplicate = fixture({
    inferred: ["| O-001 | A duplicated assertion. | `manuscript/1.md:3` | None. | Undecided |"],
  });
  assert.match(messages(duplicate), /duplicate final assertion ID: O-001/);
  assert.match(messages(duplicate), /only a destination entry for a recorded move may retain O-NNN; use — for an entry drafted directly in this table/);
});

test("draft baseline CLI validates Markdown and resolves project-relative paths", async (t) => {
  const directory = await temporaryDirectory(t);
  const validFile = path.join(directory, "valid.md");
  await writeFile(validFile, fixture(), "utf8");
  const valid = runValidator(["--draft-baseline", validFile]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /1 checks, 0 failures/);

  const invalidFile = path.join(directory, "invalid.md");
  await writeFile(invalidFile, fixture({ inferred: [] }), "utf8");
  const invalid = runValidator(["--draft-baseline", invalidFile]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /O-003 has no recorded destination/);

  const duplicateFile = path.join(directory, "duplicate.md");
  await writeFile(duplicateFile, fixture({
    inferred: ["| O-001 | A duplicated assertion. | `manuscript/1.md:3` | None. | Undecided |"],
  }), "utf8");
  const duplicate = runValidator(["--draft-baseline", duplicateFile]);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /only a destination entry for a recorded move may retain O-NNN; use — for an entry drafted directly in this table/);

  assert.equal(runValidator(["--draft-baseline"]).status, 2);

  const project = path.join(directory, "project");
  await cp(exampleRoot(), project, { recursive: true });
  await writeFile(path.join(project, "proposal.md"), fixture(), "utf8");
  const fromProject = runValidator([
    "--project-root", project,
    "--draft-baseline", "proposal.md",
  ], directory);
  assert.equal(fromProject.status, 0, fromProject.stderr);
  assert.match(fromProject.stdout, /proposal\.md/);
});
