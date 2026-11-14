import { readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";
import { inspectProjectEvidence, readProjectReviewJobs, selectProjectReviewJobs } from "./evidence-inspection.mjs";
import { reportFindingIdentities } from "./findings.mjs";
import { validateManifest } from "./manifest.mjs";
import { PENDING_ARTIFACT_INDEX, refreshPendingForEvidence } from "./pending-artifacts.mjs";
import { inspectProjectManifest } from "./project-inspection.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { syncTrackerFindingHistory, validateTrackerFindingHistory } from "./tracker-history.mjs";
import { splitTrackerRow } from "./tracker.mjs";
import { withProjectWriteLock } from "./write-lock.mjs";

const OPERATIONS = new Set([
  "intake", "draft-baseline", "diagnostics", "characters", "revision-plan",
  "chapter-revision", "prose", "ai-cleanup", "current-scope-review",
]);

function failure(message) {
  const error = new Error(message);
  error.code = "ERR_VALIDATION";
  return error;
}

async function files(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(target));
    else if (entry.isSymbolicLink()) throw failure(`cleanup inventory does not follow symbolic links: ${target}`);
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

async function load(projectRoot) {
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!validateManifest(manifest).valid) throw failure("evidence retention requires a valid v3.1 manifest");
  const project = await inspectProjectManifest(manifestPath);
  if (!project.valid) throw failure(`project validation must pass before evidence cleanup: ${project.checks.filter((check) => !check.valid).flatMap((check) => check.errors.map((error) => `${check.path}: ${error.message}`)).join("; ")}`);
  const tracker = await readFile(path.resolve(projectRoot, manifest.paths.audit_tracker), "utf8");
  const reports = await reportFindingIdentities(projectRoot, manifest.paths.reports);
  return { manifestPath, manifest, tracker, reports };
}

function portable(projectRoot, value) {
  if (typeof value !== "string" || !validateRelativePath(value).valid) return null;
  const target = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, target);
  return relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ? null : value;
}

function collectReportReferences(value, projectRoot, protectedPaths) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectReportReferences(item, projectRoot, protectedPaths);
    return;
  }
  if (typeof value.path === "string") {
    const safe = portable(projectRoot, value.path);
    if (safe?.endsWith(".md")) protectedPaths.add(safe);
  }
  if (typeof value.report === "string") {
    const safe = portable(projectRoot, value.report);
    if (safe) protectedPaths.add(safe);
  }
  if (typeof value.source_report === "string") {
    const safe = portable(projectRoot, value.source_report);
    if (safe) protectedPaths.add(safe);
  }
  if (typeof value.synthesis_report === "string") {
    const safe = portable(projectRoot, value.synthesis_report);
    if (safe) protectedPaths.add(safe);
  }
  for (const [key, child] of Object.entries(value)) {
    if (!["path", "report", "source_report", "synthesis_report"].includes(key)) {
      collectReportReferences(child, projectRoot, protectedPaths);
    }
  }
}

function latestJobPaths(jobs) {
  const selected = new Map();
  for (const job of jobs) {
    const key = `${job.mode}\0${job.perspective}`;
    const previous = selected.get(key);
    if (!previous || (job.updated_at ?? job.created_at ?? job.path) > (previous.updated_at ?? previous.created_at ?? previous.path)) {
      selected.set(key, job);
    }
  }
  return [...selected.values()];
}

function trackerReportPaths(tracker, projectRoot, protectedPaths) {
  const lines = tracker.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "## Findings");
  if (start === -1) return;
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  for (const line of lines.slice(start + 1, end === -1 ? lines.length : end)) {
    const cells = splitTrackerRow(line);
    if (!cells || cells.length !== 8) continue;
    const value = cells[5] ?? "";
    const match = value.match(/\[[^\]]+\]\(([^)]+)\)/);
    const text = match?.[1] ?? value;
    const safe = portable(projectRoot, text.startsWith("`") && text.endsWith("`") ? text.slice(1, -1) : text);
    if (safe?.endsWith(".md")) protectedPaths.add(safe);
  }
}

async function plan(projectRoot, state, operation) {
  const { manifest, tracker, reports } = state;
  const scopeId = manifest.current_scope?.scope_id;
  const protectedPaths = new Set([manifest.paths.audit_tracker]);
  const pendingPaths = new Set();
  const blocked = [];
  const keep = (value) => {
    const safe = portable(projectRoot, value);
    if (safe) protectedPaths.add(safe);
  };
  trackerReportPaths(tracker, projectRoot, protectedPaths);
  if (manifest.pending_action) {
    for (const artifact of manifest.pending_action.artifacts ?? []) pendingPaths.add(artifact);
    if (manifest.pending_action.artifact_index) {
      const pending = JSON.parse(await readFile(path.join(projectRoot, PENDING_ARTIFACT_INDEX), "utf8"));
      for (const artifact of pending.artifacts ?? []) pendingPaths.add(artifact);
    }
  }
  const indexPath = path.join(projectRoot, manifest.paths.reports, "coverage-index.json");
  let index = null;
  try {
    index = JSON.parse(await readFile(indexPath, "utf8"));
    if (!Array.isArray(index.entries)) throw failure("coverage index has no entries array");
    collectReportReferences(index, projectRoot, protectedPaths);
    for (const entry of index.entries ?? []) {
      for (const ref of entry.units ?? []) {
        keep(ref.path);
        const unit = JSON.parse(await readFile(path.resolve(projectRoot, ref.path), "utf8"));
        keep(unit.source_report);
        collectReportReferences(unit, projectRoot, protectedPaths);
      }
      keep(entry.synthesis_report);
    }
  } catch (error) {
    if (error.code !== "ENOENT") blocked.push(`coverage index is unavailable or invalid: ${error.message}`);
  }
  const jobs = await readProjectReviewJobs(projectRoot, manifest, scopeId);
  const selectedJobs = latestJobPaths(jobs);
  for (const job of selectedJobs) {
    keep(job.path);
    keep(job.reviewer_state_path);
    collectReportReferences(job, projectRoot, protectedPaths);
    if (job.perspective === "fresh") {
      const statePath = portable(projectRoot, job.reviewer_state_path);
      if (statePath) {
        const reader = JSON.parse(await readFile(path.resolve(projectRoot, statePath), "utf8"));
        for (const chunk of reader.chunks ?? []) keep(chunk.report);
      }
    }
  }
  if (scopeId) {
    const scopedReports = reports.filter((report) =>
      report.envelope.engine?.notes?.match(/(?:^|\s)scope_id=([^\s;]+)/)?.[1] === scopeId);
    const latestByAudit = new Map();
    for (const report of scopedReports) {
      const key = `${report.envelope.stage}\0${report.envelope.audit}`;
      const previous = latestByAudit.get(key);
      if (!previous || report.envelope.created_at > previous.envelope.created_at ||
          (report.envelope.created_at === previous.envelope.created_at && report.path > previous.path)) {
        latestByAudit.set(key, report);
      }
    }
    if (manifest.evidence_retention?.mode !== "bounded") {
      for (const report of latestByAudit.values()) keep(report.path);
    }
    if (scopedReports.length) keep(scopedReports.reduce((latest, report) =>
      report.envelope.created_at > latest.envelope.created_at ? report : latest).path);
  }
  for (const report of reports) {
    for (const finding of report.envelope.findings ?? []) {
      if (tracker.includes(`\`${finding.id}\``) || tracker.includes(`| ${finding.id} |`)) {
        if (protectedPaths.has(report.path)) keep(report.path);
      }
    }
  }
  const latestSessions = new Map();
  const incompleteJobs = jobs.filter((job) => job.status !== "complete");
  const pendingOperation = manifest.pending_action?.status === "in_progress" ? manifest.pending_action.operation : null;
  for (const file of await files(path.resolve(projectRoot, manifest.paths.sessions))) {
    const relative = path.relative(projectRoot, file).replaceAll(path.sep, "/");
    if (!relative.endsWith(".md")) continue;
    const text = await readFile(file, "utf8");
    const operationMatch = text.match(/^- Operation:\s*`([a-z-]+)`\s*$/mi) ?? relative.match(/revise-(?:draft|fiction|increment|request)[-_]([a-z-]+?)(?:-r\d+)?\.md$/i);
    const sessionOperation = operationMatch?.[1]?.replaceAll("_", "-");
    if (!sessionOperation || (operation && sessionOperation !== operation)) continue;
    if (/unverified|interrupted|blocked|未完成|中断|待恢复/i.test(text) && sessionOperation === pendingOperation) continue;
    if (incompleteJobs.some((job) => text.includes(job.job_id))) continue;
    const previous = latestSessions.get(sessionOperation);
    if (!previous || relative > previous.path) latestSessions.set(sessionOperation, { path: relative, text });
  }
  for (const session of latestSessions.values()) {
    protectedPaths.add(session.path);
    for (const match of session.text.matchAll(/(?:`([^`\n]+)`|\[[^\]]+\]\(([^)]+)\))/g)) {
      const value = match[1] ?? match[2];
      if (/^(?:reports\/|\.author-toolkit\/(?:reviews|handoffs)\/)/.test(value) && /\.(?:md|json)$/.test(value)) keep(value);
    }
  }
  const candidates = [];
  const roots = [manifest.paths.reports, ".author-toolkit/reviews/", manifest.paths.sessions];
  for (const root of roots) {
    for (const file of await files(path.resolve(projectRoot, root))) {
      const relative = path.relative(projectRoot, file).replaceAll(path.sep, "/");
      if (protectedPaths.has(relative)) continue;
      if (relative.endsWith("review_brief.md")) continue;
      if (relative.startsWith(manifest.paths.reports) && relative.endsWith(".md")) {
        const report = reports.find((candidate) => candidate.path === relative);
        if (!report) {
          blocked.push(`unrecognized report: ${relative}`);
          continue;
        }
        if (operation && report.envelope.stage !== operation) continue;
      } else if (relative.startsWith("reports/coverage/") && relative.endsWith(".json")) {
        let unit;
        try { unit = JSON.parse(await readFile(file, "utf8")); } catch { blocked.push(`unrecognized coverage unit: ${relative}`); continue; }
        if (operation && unit.operation !== operation) continue;
      } else if (relative.startsWith(".author-toolkit/reviews/") && relative.endsWith(".json")) {
        let job;
        try { job = JSON.parse(await readFile(file, "utf8")); } catch { blocked.push(`unrecognized review state: ${relative}`); continue; }
        if (operation && operation !== "current-scope-review") continue;
        const isJob = jobs.some((candidate) => candidate.path === relative);
        if (isJob) {
          if (job.scope_id !== scopeId || job.status !== "complete") continue;
        } else {
          const owner = jobs.find((candidate) => candidate.reviewer_state_path === relative);
          if (!owner || owner.scope_id !== scopeId || owner.status !== "complete") continue;
        }
      } else if (!relative.endsWith(".md")) {
        continue;
      }
      if (relative.startsWith(manifest.paths.sessions) && relative.endsWith(".md")) {
        const sessionText = await readFile(file, "utf8");
        const sessionOperation = (sessionText.match(/^- Operation:\s*`([a-z-]+)`\s*$/mi) ?? relative.match(/revise-(?:draft|fiction|increment|request)[-_]([a-z-]+?)(?:-r\d+)?\.md$/i))?.[1]?.replaceAll("_", "-");
        if (!sessionOperation || latestSessions.get(sessionOperation)?.path === relative) continue;
        if (operation && sessionOperation !== operation) continue;
      }
      candidates.push(relative);
    }
  }
  const handoffs = path.resolve(projectRoot, manifest.paths.handoffs);
  for (const file of await files(handoffs)) {
    const relative = path.relative(projectRoot, file).replaceAll(path.sep, "/");
    if (protectedPaths.has(relative)) continue;
    if (!relative.endsWith(".md")) continue;
    const job = jobs.find((candidate) => candidate.reviewer_state_path === relative);
    if (!job) {
      const text = await readFile(file, "utf8");
      if (!text.includes("current-scope-review")) continue;
    } else if (job.scope_id !== scopeId || job.status !== "complete") continue;
    if (!operation || operation === "current-scope-review") candidates.push(relative);
  }
  for (const job of jobs) {
    if (job.status !== "complete") {
      keep(job.path);
      keep(job.reviewer_state_path);
      collectReportReferences(job, projectRoot, protectedPaths);
    }
  }
  const replaceablePending = manifest.pending_action?.status === "awaiting_author" && manifest.pending_action.operation === operation;
  const deletable = [...new Set(candidates.filter((candidate) =>
    !protectedPaths.has(candidate) && !(pendingPaths.has(candidate) && !replaceablePending)))];
  if (blocked.length) return {
    mode: manifest.evidence_retention?.mode ?? "preserved",
    operation: operation ?? null,
    protected_paths: [...protectedPaths].sort(),
    candidates: [],
    blocked,
  };
  return {
    mode: manifest.evidence_retention?.mode ?? "preserved",
    operation: operation ?? null,
    protected_paths: [...protectedPaths].sort(),
    candidates: deletable.sort(),
    blocked,
  };
}

export async function previewEvidenceRetention({ projectRoot, operation }) {
  const state = await load(projectRoot);
  if (operation && !OPERATIONS.has(operation)) throw failure(`unsupported evidence operation: ${operation}`);
  if (state.manifest.pending_action?.status === "in_progress" && state.manifest.pending_action.operation === operation) {
    throw failure("an active operation must refresh its pending action before replacing old evidence");
  }
  return plan(projectRoot, state, operation);
}

export async function applyEvidenceRetention({ projectRoot, enable = false, operation, locked = false, pendingEntry, pendingUpdatedAt }) {
  let state = await load(projectRoot);
  if (operation && !OPERATIONS.has(operation)) throw failure(`unsupported evidence operation: ${operation}`);
  if (state.manifest.evidence_retention?.mode !== "bounded" && !enable) {
    throw failure("bounded evidence retention requires explicit --enable --apply");
  }
  const initial = await plan(projectRoot, state, operation);
  if (initial.blocked.length) throw failure(initial.blocked.join("; "));
  const retired = state.manifest.evidence_retention?.mode === "bounded" ? [] : initial.candidates;
  const nextTracker = syncTrackerFindingHistory(state.tracker, state.reports, retired);
  const summary = `| retention | current | none | local, none | full | ${new Date().toISOString()} | Bounded evidence cleanup: ${initial.candidates.length} file(s) retired; current evidence and recovery references preserved. |\n`;
  const trackerWithSummary = nextTracker.replace(/(\| Stage \| Scope \| Report \| Engine and fallback \| Language coverage \| Run at \| Result \|\r?\n\|(?:---\|)+\r?\n)/, `$1${summary}`);
  if (nextTracker !== state.tracker) {
    const validation = validateTrackerFindingHistory(nextTracker, state.reports.filter((report) => !retired.includes(report.path)));
    if (!validation.valid) throw failure(validation.errors.map((item) => item.message).join("; "));
  }
  const execute = async () => {
    const latest = await load(projectRoot);
    const latestPlan = await plan(projectRoot, latest, operation);
    if (JSON.stringify(latestPlan.candidates) !== JSON.stringify(initial.candidates)) {
      throw failure("evidence references changed before cleanup; preview again");
    }
    const trackerPath = path.resolve(projectRoot, latest.manifest.paths.audit_tracker);
    if (trackerWithSummary !== latest.tracker) {
      const temporary = `${trackerPath}.${process.pid}.tmp`;
      await writeFile(temporary, trackerWithSummary, "utf8");
      await rename(temporary, trackerPath);
    }
    if (enable) {
      const nextManifest = { ...latest.manifest, evidence_retention: { mode: "bounded" } };
      await writeJsonAtomic(state.manifestPath, nextManifest);
    }
    if (pendingEntry) {
      await refreshPendingForEvidence({
        projectRoot,
        manifestPath: state.manifestPath,
        operation,
        artifacts: [pendingEntry.synthesis_report, ...pendingEntry.units.map((unit) => unit.path)].filter(Boolean),
        updatedAt: pendingUpdatedAt,
      });
    }
    const deleted = [];
    const failures = [];
    for (const candidate of latestPlan.candidates) {
      try {
        const target = path.resolve(projectRoot, candidate);
        const real = await realpath(target);
        if (!real.startsWith(`${await realpath(projectRoot)}${path.sep}`)) throw failure("cleanup target escapes the project root");
        await rm(target);
        deleted.push(candidate);
      } catch (error) {
        failures.push({ path: candidate, message: error.message });
      }
    }
    const finalState = await load(projectRoot);
    const evidence = finalState.manifest.current_scope
      ? await inspectProjectEvidence(finalState.manifest, state.manifestPath)
      : null;
    if (evidence && !evidence.valid) {
      failures.push({ path: "evidence", message: "post-cleanup evidence validation failed" });
    }
    return {
      valid: failures.length === 0,
      mode: "bounded",
      operation: operation ?? null,
      migrated: enable && state.manifest.evidence_retention?.mode !== "bounded",
      deleted,
      deleted_count: deleted.length,
      failures,
    };
  };
  return locked ? execute() : withProjectWriteLock(state.manifestPath, state.manifest, execute);
}
