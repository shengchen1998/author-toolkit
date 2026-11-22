import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const evidenceScopeId = "scope-example-revision";

async function writeJson(projectRoot, relativePath, value) {
  const target = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function report(reportId, audit, createdAt) {
  return `# Evidence\n\n## Language coverage\n\nCoverage: full.\n\n\`\`\`json\n${JSON.stringify({
    schema_version: "2.0.0",
    report_id: reportId,
    audit,
    stage: "current-scope-review",
    created_at: createdAt,
    language: "en",
    skill: { name: "author-review", version: "3.1.0" },
    inputs: [{ path: "manuscript/chapter-01.md", version: "a".repeat(64), version_type: "sha256" }],
    engine: {
      name: "conversational",
      version: "unknown",
      degraded: false,
      notes: `scope_id=${evidenceScopeId}; review_mode=current-scope; operation_coverage=full; coverage=full; subchecks=intent; unit=chapter-01.`,
    },
    findings: [],
  }, null, 2)}\n\`\`\`\n`;
}

function reviewJob(perspective, suffix, createdAt, hash) {
  const report = `reports/current-scope-review/${suffix}.md`;
  return {
    schema_version: "1.0.0",
    job_id: `review-${suffix}`,
    mode: "current-scope",
    perspective,
    scope_id: evidenceScopeId,
    status: "complete",
    coverage: "full",
    files: [{ path: "manuscript/chapter-01.md", sha256: hash, line_count: 1 }],
    chunks: [{
      chunk_id: `chunk-${suffix}`,
      sequence: 1,
      status: "complete",
      sources: [{ path: "manuscript/chapter-01.md", sha256: hash, line_start: 1, line_end: 1 }],
      report,
    }],
    volumes: [{ volume_id: `volume-${suffix}`, chunk_ids: [`chunk-${suffix}`], status: "complete", report }],
    book: { volume_ids: [`volume-${suffix}`], status: "complete", report },
    context_budget: { profile: "standard", estimate_tokens: 1000 },
    next_chunk_id: null,
    reviewer_state_path: `.author-toolkit/reviews/reader-${suffix}.json`,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export async function createEvidenceFixture(exampleProject, setupAssets, projectRoot) {
  await cp(exampleProject, projectRoot, { recursive: true });
  await mkdir(path.join(projectRoot, "reports/current-scope-review"), { recursive: true });
  await cp(path.join(setupAssets, "AGENTS.md"), path.join(projectRoot, "AGENTS.md"));
  await rm(path.join(projectRoot, "CLAUDE.md"), { force: true });
  await symlink("AGENTS.md", path.join(projectRoot, "CLAUDE.md"));
  const manifestPath = path.join(projectRoot, ".author-toolkit/project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(path.join(projectRoot, "manuscript/chapter-01.md"), "One complete test chapter.\n");
  const tracker = await readFile(path.join(projectRoot, manifest.paths.audit_tracker), "utf8");
  const resolved = "| STRUCT-004 | structure | story-structure-audit | `manuscript/chapter-01.md`, chapter 1 | resolved | `reports/structure/2026-01-17_structure.md` | 2026-01-18T00:00:00Z | Author retained the structural choice. |";
  await writeFile(path.join(projectRoot, manifest.paths.audit_tracker), tracker.replace(/\| STRUCT-004[^\n]+/, resolved));
  await writeFile(path.join(projectRoot, "reports/review_brief.md"), `# Review Brief\n\n- Updated: 2026-11-15T00:00:00Z\n- Tracker: \`audit-tracker.md\`\n\n## Resolved decisions\n\n| Finding ID | Location | Decision reason | Current report |\n|---|---|---|---|\n| STRUCT-004 | \`manuscript/chapter-01.md\`, chapter 1 | Author retained the structural choice. | reports/structure/2026-01-17_structure.md |\n\n## Dismissed decisions\n\n| Finding ID | Location | Decision reason | Current report |\n|---|---|---|---|\n`);
  const manuscript = await readFile(path.join(projectRoot, "manuscript/chapter-01.md"), "utf8");
  const hash = createHash("sha256").update(manuscript).digest("hex");
  manifest.current_scope.files[0].sha256 = hash;
  await writeJson(projectRoot, ".author-toolkit/project.json", manifest);

  for (const perspective of ["intent", "standards", "fresh"]) {
    const suffix = `${perspective}-r2`;
    const job = reviewJob(perspective, suffix, "2026-11-15T02:00:00Z", hash);
    await writeJson(projectRoot, `.author-toolkit/reviews/review-${suffix}.json`, job);
    await writeFile(path.join(projectRoot, job.chunks[0].report), report(`REPORT-${suffix.toUpperCase()}`, `author-review-${perspective}`, job.created_at));
    await writeFile(path.join(projectRoot, `reports/current-scope-review/${perspective}-r1.md`), report(`REPORT-${perspective.toUpperCase()}-R1`, `author-review-${perspective}`, "2026-11-15T01:00:00Z"));
    if (perspective === "fresh") {
      await writeJson(projectRoot, job.reviewer_state_path, {
        schema_version: "1.0.0",
        state_id: "reader-fresh-r2",
        job_id: job.job_id,
        scope_id: evidenceScopeId,
        perspective,
        status: "complete",
        next_sequence: 2,
        chunks: [{ chunk_id: job.chunks[0].chunk_id, sequence: 1, sources: job.chunks[0].sources, report: job.chunks[0].report }],
        summary: "Read the complete chapter.",
        open_questions: [],
        updated_at: job.updated_at,
      });
    }
  }
  const oldJob = reviewJob("intent", "intent-r1", "2026-11-15T01:00:00Z", hash);
  await writeJson(projectRoot, ".author-toolkit/reviews/review-intent-r1.json", oldJob);
  const units = ["intent", "standards", "fresh"].map((perspective) => ({
    unit_id: `unit-${perspective}-r2`,
    path: `reports/coverage/unit-${perspective}-r2.json`,
  }));
  for (const [index, reference] of units.entries()) {
    await writeJson(projectRoot, reference.path, {
      schema_version: "1.0.0",
      unit_id: reference.unit_id,
      source_report: `reports/current-scope-review/${["intent", "standards", "fresh"][index]}-r2.md`,
      scope_id: evidenceScopeId,
      operation: "current-scope-review",
      kind: "local",
      paths: [{ path: "manuscript/chapter-01.md", sha256: hash }],
      subchecks: [["intent", "standards", "fresh"][index]],
      dependencies: [],
      coverage: "full",
      created_at: "2026-11-15T00:00:00Z",
    });
  }
  await writeJson(projectRoot, "reports/coverage-index.json", {
    schema_version: "1.0.0",
    scope_id: evidenceScopeId,
    entries: [{ operation: "current-scope-review", units, synthesis_report: "reports/current-scope-review/fresh-r2.md", synthesis_coverage: "full" }],
    updated_at: "2026-11-15T00:00:00Z",
  });
  return { projectRoot, manifest };
}
