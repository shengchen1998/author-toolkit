import assert from "node:assert/strict";
import test from "node:test";

import {
  checkReviewCoverage,
  validateReaderState,
  validateReaderStateForJob,
  validateReaderStateMarkdown,
  validateReviewJob,
} from "../scripts/lib/index.mjs";

const timestamp = "2026-11-04T00:00:00Z";
const hash = "a".repeat(64);

function reviewJob() {
  return {
    schema_version: "1.0.0",
    job_id: "review-001",
    mode: "final",
    perspective: "fresh",
    scope_id: "scope-1",
    status: "complete",
    coverage: "full",
    files: [{ path: "manuscript/chapter-001.md", sha256: hash, line_count: 160 }],
    chunks: [
      {
        chunk_id: "chunk-001",
        sequence: 1,
        status: "complete",
        sources: [
          {
            path: "manuscript/chapter-001.md",
            sha256: hash,
            line_start: 1,
            line_end: 80,
          },
        ],
        report: "reports/final/fresh/chunk-001.md",
      },
      {
        chunk_id: "chunk-002",
        sequence: 2,
        status: "complete",
        sources: [
          {
            path: "manuscript/chapter-001.md",
            sha256: hash,
            line_start: 81,
            line_end: 160,
          },
        ],
        report: "reports/final/fresh/chunk-002.md",
      },
    ],
    volumes: [
      {
        volume_id: "volume-001",
        chunk_ids: ["chunk-001", "chunk-002"],
        status: "complete",
        report: "reports/final/fresh/volume-001.md",
      },
    ],
    book: {
      volume_ids: ["volume-001"],
      status: "complete",
      report: "reports/final/fresh/book.md",
    },
    context_budget: { profile: "fresh-reader-standard", estimate_tokens: 24000 },
    next_chunk_id: null,
    reviewer_state_path: ".author-toolkit/sessions/review-001-reader.md",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test("review completion requires complete source ranges and chunk-volume-book synthesis", () => {
  const job = reviewJob();
  assert.equal(validateReviewJob(job).valid, true);
  assert.equal(checkReviewCoverage(job).coverage, "full");

  const incomplete = structuredClone(job);
  incomplete.status = "in_progress";
  incomplete.coverage = "partial";
  incomplete.chunks[1].status = "pending";
  incomplete.chunks[1].report = null;
  incomplete.volumes[0].status = "pending";
  incomplete.volumes[0].report = null;
  incomplete.book.status = "pending";
  incomplete.book.report = null;
  incomplete.next_chunk_id = "chunk-002";
  assert.equal(validateReviewJob(incomplete).valid, true);
  assert.equal(checkReviewCoverage(incomplete).coverage, "partial");

  const premature = structuredClone(incomplete);
  premature.status = "complete";
  premature.coverage = "full";
  const result = validateReviewJob(premature);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "review-completion"));

  const lineGap = structuredClone(job);
  lineGap.chunks[1].sources[0].line_start = 82;
  assert.equal(checkReviewCoverage(lineGap).coverage, "partial");
  assert.equal(validateReviewJob(lineGap).valid, false);
});

test("fresh review sequence numbers are continuous for resumable state", () => {
  const job = reviewJob();
  job.chunks[1].sequence = 3;
  const result = validateReviewJob(job);

  assert.equal(result.valid, false);
  assert.equal(checkReviewCoverage(job).coverage, "partial");
  assert.ok(result.errors.some((error) => error.keyword === "review-sequence"));
});

test("fresh review rejects reversed manuscript source order", () => {
  const job = reviewJob();
  const firstSource = job.chunks[0].sources[0];
  job.chunks[0].sources[0] = job.chunks[1].sources[0];
  job.chunks[1].sources[0] = firstSource;
  const result = validateReviewJob(job);

  assert.equal(result.valid, false);
  assert.equal(checkReviewCoverage(job).coverage, "partial");
  assert.ok(result.errors.some((error) => error.keyword === "review-order"));
});

test("fresh review completion is a prefix and resumes at the first incomplete chunk", () => {
  const job = reviewJob();
  job.status = "in_progress";
  job.coverage = "partial";
  job.chunks[0].status = "pending";
  job.chunks[0].report = null;
  job.volumes[0].status = "pending";
  job.volumes[0].report = null;
  job.book.status = "pending";
  job.book.report = null;
  const result = validateReviewJob(job);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "review-progress"));
  assert.ok(
    result.errors.some(
      (error) => error.keyword === "review-resume" && error.instancePath === "/next_chunk_id",
    ),
  );
});

test("review coverage counts every source line exactly once for every perspective", () => {
  for (const perspective of ["fresh", "intent", "standards"]) {
    const job = reviewJob();
    job.perspective = perspective;
    job.chunks[1].sources[0].line_start = 80;

    assert.equal(checkReviewCoverage(job).coverage, "partial", perspective);
    assert.equal(validateReviewJob(job).valid, false, perspective);
  }
});

test("malformed review references return validation errors instead of throwing", () => {
  const job = reviewJob();
  job.volumes[0].chunk_ids = { unexpected: "chunk-001" };
  job.book.volume_ids = { unexpected: "volume-001" };

  assert.doesNotThrow(() => validateReviewJob(job));
  assert.equal(validateReviewJob(job).valid, false);
  assert.equal(checkReviewCoverage(job).coverage, "partial");
});

function readerState() {
  return {
    schema_version: "1.0.0",
    state_id: "reader-001",
    job_id: "review-001",
    scope_id: "scope-1",
    perspective: "fresh",
    status: "in_progress",
    next_sequence: 2,
    chunks: [
      {
        chunk_id: "chunk-001",
        sequence: 1,
        sources: [
          {
            path: "manuscript/chapter-001.md",
            sha256: hash,
            line_start: 1,
            line_end: 80,
          },
        ],
        report: "reports/final/fresh/chunk-001.md",
      },
    ],
    summary: "The protagonist's immediate goal is clear, but the stakes are not yet stable.",
    open_questions: ["What changes if the winter ferry leaves?"],
    updated_at: timestamp,
  };
}

test("reader state validates as JSON or Markdown and preserves continuous fresh progress", () => {
  const state = readerState();
  assert.equal(validateReaderState(state).valid, true);
  const markdown = `# Reader state\n\n${state.summary}\n\n\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n`;
  assert.equal(validateReaderStateMarkdown(markdown).valid, true);

  const gap = structuredClone(state);
  gap.chunks[0].sequence = 2;
  gap.next_sequence = 3;
  const result = validateReaderState(gap);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "reader-sequence"));

  assert.equal(validateReaderStateMarkdown("# Missing state").valid, false);
});

test("fresh reader state matches its job identity, chunks, sources, reports, and file order", () => {
  const job = reviewJob();
  job.files = [
    { path: "manuscript/chapter-001.md", sha256: hash, line_count: 80 },
    { path: "manuscript/chapter-002.md", sha256: "b".repeat(64), line_count: 80 },
  ];
  job.chunks = [
    {
      ...job.chunks[0],
      sources: [
        {
          path: "manuscript/chapter-001.md",
          sha256: hash,
          line_start: 1,
          line_end: 80,
        },
        {
          path: "manuscript/chapter-002.md",
          sha256: "b".repeat(64),
          line_start: 1,
          line_end: 80,
        },
      ],
    },
  ];
  job.volumes[0].chunk_ids = ["chunk-001"];
  const state = readerState();
  state.status = "complete";
  state.chunks[0].sources = structuredClone(job.chunks[0].sources);

  assert.equal(validateReviewJob(job).valid, true);
  assert.equal(validateReaderStateForJob(state, job).valid, true);

  const reversed = structuredClone(state);
  reversed.chunks[0].sources.reverse();
  assert.equal(validateReaderState(reversed).valid, true);
  const reversedResult = validateReaderStateForJob(reversed, job);
  assert.equal(reversedResult.valid, false);
  assert.ok(reversedResult.errors.some((error) => error.keyword === "reader-job-order"));

  for (const [field, replacement] of Object.entries({
    job_id: "review-002",
    scope_id: "scope-2",
    perspective: "intent",
  })) {
    const mismatched = structuredClone(state);
    mismatched[field] = replacement;
    assert.equal(validateReaderState(mismatched).valid, true, field);
    const result = validateReaderStateForJob(mismatched, job);
    assert.equal(result.valid, false, field);
    assert.ok(
      result.errors.some((error) => error.keyword === "reader-job-identity"),
      field,
    );
  }

  const wrongHash = structuredClone(state);
  wrongHash.chunks[0].sources[0].sha256 = "c".repeat(64);
  assert.equal(validateReaderState(wrongHash).valid, true);
  const hashResult = validateReaderStateForJob(wrongHash, job);
  assert.equal(hashResult.valid, false);
  assert.ok(hashResult.errors.some((error) => error.keyword === "reader-job-source"));

  const wrongReport = structuredClone(state);
  wrongReport.chunks[0].report = "reports/final/fresh/other.md";
  assert.equal(validateReaderState(wrongReport).valid, true);
  const reportResult = validateReaderStateForJob(wrongReport, job);
  assert.equal(reportResult.valid, false);
  assert.ok(reportResult.errors.some((error) => error.keyword === "reader-job-report"));

  const unknownChunk = structuredClone(state);
  unknownChunk.chunks[0].chunk_id = "chunk-unknown";
  const chunkResult = validateReaderStateForJob(unknownChunk, job);
  assert.equal(chunkResult.valid, false);
  assert.ok(chunkResult.errors.some((error) => error.keyword === "reader-job-chunk"));

  const skippedChunk = readerState();
  const secondJobChunk = reviewJob().chunks[1];
  skippedChunk.chunks[0] = {
    chunk_id: secondJobChunk.chunk_id,
    sequence: 1,
    sources: structuredClone(secondJobChunk.sources),
    report: secondJobChunk.report,
  };
  assert.equal(validateReaderState(skippedChunk).valid, true);
  const chainResult = validateReaderStateForJob(skippedChunk, reviewJob());
  assert.equal(chainResult.valid, false);
  assert.ok(chainResult.errors.some((error) => error.keyword === "reader-job-chain"));
});


test("a completed fresh job requires the reader state to contain every job chunk", () => {
  const job = reviewJob();
  const state = readerState();
  state.status = "complete";

  const result = validateReaderStateForJob(state, job);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.keyword === "reader-job-chain"));

  const complete = structuredClone(state);
  complete.chunks.push({
    chunk_id: job.chunks[1].chunk_id,
    sequence: 2,
    sources: structuredClone(job.chunks[1].sources),
    report: job.chunks[1].report,
  });
  complete.next_sequence = 3;
  assert.equal(validateReaderStateForJob(complete, job).valid, true);
});
