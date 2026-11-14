import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { validateCoverageIndex } from "./artifacts.mjs";
import { reportFindingIdentities, validateFindingBatch } from "./findings.mjs";
import { trackerHistoryAsReports, validateTrackerFindingHistory } from "./tracker-history.mjs";
import { extractReportEnvelope, validateEvidenceReport, validateMarkdownReport } from "./markdown.mjs";
import { projectRootFromManifest } from "./project-files.mjs";
import { validateReviewBrief } from "./review-brief.mjs";
import { validateReaderStateForJob, validateReaderStateMarkdown, validateReviewJob } from "./review.mjs";
import { validateCoverageUnitSchema, validateRelativePath } from "./schemas.mjs";

const evidenceStages = new Set(["draft-baseline", "diagnostics", "current-scope-review"]);

export async function projectJobFiles(projectRoot, manifest) {
  const sessionsRoot = validateRelativePath(manifest.paths.sessions).valid
    ? path.resolve(projectRoot, manifest.paths.sessions)
    : path.join(projectRoot, manifest.paths.sessions);
  return [
    ...await regularFiles(path.join(projectRoot, ".author-toolkit", "reviews"), ".json"),
    ...await regularFiles(sessionsRoot, ".json"),
  ];
}

export async function readProjectReviewJobs(projectRoot, manifest, selectedScopeId) {
  const jobFiles = await projectJobFiles(projectRoot, manifest);
  const jobs = [];
  for (const file of jobFiles) {
    const relativePath = path.relative(projectRoot, file).replaceAll(path.sep, "/");
    let job;
    try {
      job = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    if (job?.schema_version !== "1.0.0" && (path.basename(file).startsWith("review-") || path.basename(file).startsWith("job-"))) {
      continue;
    }
    if (job?.schema_version !== "1.0.0" || typeof job.job_id !== "string" || typeof job.mode !== "string" ||
        typeof job.perspective !== "string" || job.scope_id !== selectedScopeId || !Array.isArray(job.chunks) ||
        !Array.isArray(job.volumes)) continue;
    if (typeof job.perspective === "string" && typeof job.mode === "string") {
      const record = { ...job, path: relativePath };
      jobs.push(record);
    }
  }
  return jobs.sort((left, right) =>
    left.mode.localeCompare(right.mode) || left.perspective.localeCompare(right.perspective));
}

export async function selectProjectReviewJobs(projectRoot, manifest, selectedScopeId) {
  const jobsByGroup = new Map();
  for (const record of await readProjectReviewJobs(projectRoot, manifest, selectedScopeId)) {
    const group = `${record.mode}\0${record.perspective}`;
    const previous = jobsByGroup.get(group);
    if (!previous || latest(record, previous) === record) jobsByGroup.set(group, record);
  }
  return [...jobsByGroup.values()];
}

function failure(message) {
  return { valid: false, errors: [{ instancePath: "", keyword: "evidence-inspection", message, params: {} }] };
}

function latest(left, right) {
  const leftTime = Date.parse(left.updated_at ?? left.created_at ?? "");
  const rightTime = Date.parse(right.updated_at ?? right.created_at ?? "");
  if (leftTime !== rightTime) return leftTime > rightTime ? left : right;
  return left.path > right.path ? left : right;
}

async function regularFiles(directory, extension) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await regularFiles(target, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) files.push(target);
  }
  return files.sort();
}

export async function inspectProjectEvidence(manifest, manifestPath, { scopeId, details = false } = {}) {
  const projectRoot = projectRootFromManifest(manifestPath);
  const selectedScopeId = scopeId ?? manifest.current_scope?.scope_id;
  if (!selectedScopeId) {
    return { valid: false, scope_id: null, checks: [{ path: "evidence/scope", ...failure("full evidence inspection requires --scope-id or a recorded current scope") }] };
  }

  const checks = [];
  const reportRecords = [];
  const linkedReports = new Set();
  const check = (relativePath, result) => {
    checks.push({ path: relativePath, valid: result.valid, errors: result.errors });
    return result.valid;
  };
  const resolve = (relativePath) => {
    if (typeof relativePath !== "string" || !validateRelativePath(relativePath).valid) return null;
    const absolute = path.resolve(projectRoot, relativePath);
    const relative = path.relative(projectRoot, absolute);
    return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : absolute;
  };
  const readJson = async (relativePath) => {
    const absolute = resolve(relativePath);
    if (!absolute) throw new Error("artifact path must stay inside the project root");
    return JSON.parse(await readFile(absolute, "utf8"));
  };
  const readReport = async (relativePath, identity = false) => {
    const absolute = resolve(relativePath);
    if (!absolute) return check(relativePath, failure("report path must be a portable project-relative path"));
    let markdown;
    try {
      markdown = await readFile(absolute, "utf8");
    } catch (error) {
      return check(relativePath, failure(error.message));
    }
    const parsed = validateMarkdownReport(markdown);
    const result = evidenceStages.has(parsed.envelope?.stage) ? validateEvidenceReport(markdown) : parsed;
    check(relativePath, result);
    if (parsed.envelope) {
      const record = { path: relativePath, envelope: parsed.envelope };
      if (identity) reportRecords.push(record);
    }
    return result.valid;
  };

  const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
  const tracker = await readFile(trackerPath, "utf8");
  const briefPath = path.posix.join(manifest.paths.reports, "review_brief.md");
  try {
    check(briefPath, validateReviewBrief(await readFile(resolve(briefPath), "utf8"), tracker));
  } catch (error) {
    check(briefPath, failure(error.message));
  }

  const indexPath = path.posix.join(manifest.paths.reports, "coverage-index.json");
  try {
    const index = await readJson(indexPath);
    check(indexPath, validateCoverageIndex(index));
    if (index.scope_id !== selectedScopeId) {
      check(`${indexPath}#scope`, failure(`coverage index scope_id must be ${selectedScopeId}`));
    }
    const unitIds = new Set();
    const indexUnitKeys = new Set();
    const validatedUnits = new Set();
    for (const [entryIndex, entry] of (Array.isArray(index.entries) ? index.entries : []).entries()) {
      if (entry.synthesis_report) linkedReports.add(entry.synthesis_report);
      for (const [unitIndex, reference] of (Array.isArray(entry.units) ? entry.units : []).entries()) {
        const key = `${entry.operation}\0${reference.unit_id}`;
        if (indexUnitKeys.has(key)) {
          check(`${indexPath}#unit-${entryIndex}-${unitIndex}`, failure(`duplicate coverage unit within operation: ${reference.unit_id}`));
        }
        indexUnitKeys.add(key);
        if (typeof reference.path !== "string" || !validateRelativePath(reference.path).valid) {
          check(`${indexPath}#unit-${entryIndex}-${unitIndex}`, failure("coverage unit path must be portable and project-relative"));
          continue;
        }
        let unit;
        try {
          unit = await readJson(reference.path);
          if (!validatedUnits.has(reference.path)) check(reference.path, validateCoverageUnitSchema(unit));
          validatedUnits.add(reference.path);
        } catch (error) {
          check(reference.path, failure(error.message));
          continue;
        }
        if (unitIds.has(unit.unit_id)) {
          check(`${reference.path}#identity`, failure(`coverage unit ID is referenced more than once: ${unit.unit_id}`));
        }
        unitIds.add(unit.unit_id);
        if (unit.unit_id !== reference.unit_id || unit.operation !== entry.operation) {
          check(`${reference.path}#identity`, failure("coverage unit ID and operation must match its index reference"));
        }
        linkedReports.add(unit.source_report);
      }
    }
  } catch (error) {
    check(indexPath, failure(error.message));
  }

  for (const file of await projectJobFiles(projectRoot, manifest)) {
    if (!path.basename(file).startsWith("review-") && !path.basename(file).startsWith("job-")) continue;
    const relativePath = path.relative(projectRoot, file).replaceAll(path.sep, "/");
    try {
      const job = JSON.parse(await readFile(file, "utf8"));
      if (job?.schema_version !== "1.0.0") check(relativePath, failure("review job schema_version must be 1.0.0"));
    } catch (error) {
      check(relativePath, failure(`cannot read review job: ${error.message}`));
    }
  }
  const selectedJobs = await selectProjectReviewJobs(projectRoot, manifest, selectedScopeId);
  for (const record of selectedJobs) {
    const job = { ...record };
    const pathLabel = job.path;
    delete job.path;
    check(pathLabel, validateReviewJob(job));
    for (const report of [...job.chunks, ...job.volumes, job.book].map((unit) => unit.report)) {
      if (report) linkedReports.add(report);
    }
    if (job.perspective !== "fresh") continue;
    const readerPath = job.reviewer_state_path;
    try {
      const reader = await readJson(readerPath);
      check(readerPath, validateReaderStateForJob(reader, job));
    } catch (error) {
      if (error instanceof SyntaxError || error.code === "ENOENT") {
        try {
          const result = validateReaderStateMarkdown(await readFile(resolve(readerPath), "utf8"));
          check(readerPath, result.envelope ? validateReaderStateForJob(result.envelope, job) : result);
        } catch (markdownError) {
          check(readerPath, failure(markdownError.message));
        }
      } else {
        check(readerPath, failure(error.message));
      }
    }
  }

  const reportFiles = await regularFiles(resolve(manifest.paths.reports), ".md");
  const latestByAudit = new Map();
  let latestReport = null;
  for (const file of reportFiles) {
    const relativePath = path.relative(projectRoot, file).replaceAll(path.sep, "/");
    if (relativePath === briefPath) continue;
    let envelope;
    try {
      envelope = extractReportEnvelope(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    const scope = envelope?.engine?.notes?.match(/(?:^|\s)scope_id=([^\s;]+)/)?.[1];
    if (scope !== selectedScopeId) continue;
    const record = { path: relativePath, envelope };
    if (!latestReport || record.envelope.created_at > latestReport.envelope.created_at ||
        (record.envelope.created_at === latestReport.envelope.created_at && relativePath > latestReport.path)) {
      latestReport = record;
    }
    const key = `${envelope.stage}\0${envelope.audit}`;
    const previous = latestByAudit.get(key);
    if (!previous || envelope.created_at > previous.envelope.created_at ||
        (envelope.created_at === previous.envelope.created_at && relativePath > previous.path)) {
      latestByAudit.set(key, record);
    }
  }
  for (const record of latestByAudit.values()) {
    const stage = record.envelope.stage;
    if (manifest.evidence_retention?.mode !== "bounded" || !["prose", "ai-cleanup", "current-scope-review"].includes(stage)) {
      linkedReports.add(record.path);
    }
  }
  if (latestReport) linkedReports.add(latestReport.path);
  for (const relativePath of [...linkedReports].sort()) {
    if (typeof relativePath === "string") await readReport(relativePath, true);
  }

  const history = await reportFindingIdentities(projectRoot, manifest.paths.reports);
  const bounded = manifest.evidence_retention?.mode === "bounded";
  const identities = validateFindingBatch(reportRecords, tracker, bounded ? trackerHistoryAsReports(tracker) : history, { bounded });
  if (bounded) {
    check("tracker#finding-history", validateTrackerFindingHistory(tracker, reportRecords));
  }
  const reportIds = new Map();
  for (const record of history) {
    if (reportIds.has(record.envelope.report_id)) {
      check(`${record.path}#report-id`, failure(`duplicate report ID: ${record.envelope.report_id}; also used by ${reportIds.get(record.envelope.report_id)}`));
    } else {
      reportIds.set(record.envelope.report_id, record.path);
    }
  }
  for (const record of reportRecords) {
    const errors = identities.errors.filter((item) => item.report === record.path);
    check(`${record.path}#finding-identity`, { valid: errors.length === 0, errors });
  }
  if (reportRecords.length === 0) check("evidence/reports", failure("no selected-scope immutable evidence reports were found"));
  if (selectedJobs.length === 0) check("evidence/review-jobs", failure("no selected-scope review jobs were found"));

  return {
    valid: checks.every((result) => result.valid),
    scope_id: selectedScopeId,
    selection: {
      latest_report: latestReport?.path ?? null,
      latest_reports_by_stage_and_audit: latestByAudit.size,
      review_jobs: selectedJobs.length,
      linked_reports: linkedReports.size,
    },
    checks: details ? checks : checks.map((result) => result.valid ? { path: result.path, valid: true, errors: [] } : {
      path: result.path,
      valid: false,
      errors: result.errors.slice(0, 12),
      ...(result.errors.length > 12 ? { omitted_error_count: result.errors.length - 12 } : {}),
    }),
  };
}
