import { readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { splitTrackerRow, TRACKER_STATUSES } from "./tracker.mjs";

function markdown(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("\r", " ").replaceAll("\n", " ").trim();
}

function concise(value, limit = 240) {
  const characters = [...markdown(value)];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function code(value) {
  return `\`${markdown(value)}\``;
}

function section(markdownText, name) {
  const match = markdownText.match(new RegExp(`^ {0,3}## ${name}[ \\t]*$`, "m"));
  if (!match) return "";
  const remainder = markdownText.slice(match.index + match[0].length);
  return remainder.split(/^ {0,3}## /m)[0];
}

function tableRows(markdownText, name) {
  const rows = [];
  for (const line of section(markdownText, name).split("\n")) {
    if (!line.trim().startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    if (/^\|\s*:?-{3,}/.test(line.trim()) || /^\|\s*(?:Finding ID|Stage)\s*\|/.test(line.trim())) {
      continue;
    }
    rows.push(splitTrackerRow(line));
  }
  return rows;
}

function field(markdownText, name) {
  const prefix = `- ${name}:`;
  const line = markdownText.split("\n").find((candidate) => candidate.trim().startsWith(prefix));
  return line?.trim().slice(prefix.length).trim() || null;
}

function relativePath(value) {
  const unquoted = value?.match(/^`([^`]+)`$/)?.[1] ?? value;
  return unquoted && validateRelativePath(unquoted).valid ? unquoted : null;
}

function filenameTimestamp(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})(?:[_T](\d{2}):?(\d{2}):?(\d{2})Z?)?(?:_|\.)/);
  if (!match) return null;
  const time = match[2] ? `${match[2]}:${match[3]}:${match[4]}` : "00:00:00";
  const timestamp = Date.parse(`${match[1]}T${time}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isNewer(candidate, latest) {
  if (
    candidate.timestamp !== null &&
    latest.timestamp !== null &&
    candidate.timestamp !== latest.timestamp
  ) {
    return candidate.timestamp > latest.timestamp;
  }
  if (candidate.mtimeMs !== latest.mtimeMs) return candidate.mtimeMs > latest.mtimeMs;
  return candidate.path > latest.path;
}

async function latestFile(projectRoot, directory, extension) {
  if (!relativePath(directory)) return null;
  let latest = null;
  async function visit(relativeDirectory) {
    let entries;
    try {
      entries = await readdir(path.resolve(projectRoot, relativeDirectory), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile() && entry.name.endsWith(extension)) {
        const candidate = {
          path: relative,
          timestamp: filenameTimestamp(entry.name),
          mtimeMs: (await stat(path.resolve(projectRoot, relative))).mtimeMs,
        };
        if (latest === null || isNewer(candidate, latest)) latest = candidate;
      }
    }
  }
  await visit(directory);
  return latest?.path ?? null;
}

function findingCounts(tracker) {
  const counts = Object.fromEntries(TRACKER_STATUSES.map((status) => [status, 0]));
  for (const row of tableRows(tracker, "Findings")) {
    const status = row[4]?.replaceAll("`", "").toLowerCase();
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  return counts;
}

function fallbackReport(tracker) {
  for (const row of tableRows(tracker, "Audit runs").reverse()) {
    const report = relativePath(row[2]);
    if (report) return report;
  }
  return null;
}

function pendingArtifacts(pending) {
  const artifacts = pending?.artifacts ?? [];
  if (artifacts.length === 0) return "none recorded";
  const visible = artifacts.slice(0, 2).map(code).join(", ");
  const remainder = artifacts.length > 2 ? `, + ${artifacts.length - 2} more; see ${code(".author-toolkit/project.json")}` : "";
  return `${visible}${remainder}`;
}

export function renderProjectDigest({ manifest, tracker, latestReport, latestSession, sessionText = "" }) {
  const counts = findingCounts(tracker);
  const report = latestReport ?? fallbackReport(tracker);
  const scope = manifest.current_scope;
  const pending = manifest.pending_action;
  const plan = relativePath(field(sessionText, "Active plan"));
  const lines = [
    "# Project State",
    "",
    "> Generated navigation cache. The manifest, tracker, and current evidence remain authoritative.",
    "> Regenerate with `author-project status --digest`; do not hand-maintain this file.",
    "",
    `- Scope: ${scope ? `${code(scope.scope_id)} (${scope.status}; ${scope.files.length} file${scope.files.length === 1 ? "" : "s"})` : "none recorded"}`,
    `- Scope hashes: ${scope ? `${code(".author-toolkit/project.json")} -> ${code("current_scope.files")}` : "none recorded"}`,
    `- Pending action: ${pending ? `${code(pending.operation)} (${pending.status})` : "none recorded"}`,
    `- Pending scope: ${pending?.scope_id ? code(pending.scope_id) : "none recorded"}`,
    `- Pending reason: ${pending ? concise(pending.reason) : "none recorded"}`,
    `- Pending artifacts: ${pendingArtifacts(pending)}`,
    `- Findings: ${Object.entries(counts).map(([status, count]) => `${status}=${count}`).join(", ")}`,
    `- Active plan: ${plan ? code(plan) : "none recorded"}`,
    `- Latest report: ${report ? code(report) : "none recorded"}`,
    `- Latest session: ${latestSession ? code(latestSession) : "none recorded"}`,
    `- Next action: ${concise(field(sessionText, "Next action") ?? field(tracker, "Next action") ?? (latestSession ? `read ${code(latestSession)} for the recorded next action` : "none recorded"))}`,
    "",
    "## Read next",
    "",
    `- Manifest: ${code(".author-toolkit/project.json")} for the full scope record and pending action.`,
    "- Status: use `author-project status` for recorded blockers and execution evidence.",
    "- Validation: use `author-project validate` for current hashes and missing paths.",
    `- Tracker: ${code(manifest.paths.audit_tracker)} -> ${code("## Findings")}, ${code("## Audit runs")}, ${code("## Approved decisions")}`,
    "- Read the plan, latest session, and evidence linked above only as needed for the requested operation.",
    "- Regenerate after each shared-state operation; revalidate evidence before reuse. This cache grants no approval.",
    "",
  ];
  return lines.join("\n");
}

export async function generateProjectDigest(projectRoot) {
  const manifestPath = path.join(projectRoot, ".author-toolkit", "project.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read manifest ${manifestPath}: ${error.message}`);
  }
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    const details = validation.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
    throw new Error(`Cannot generate digest: invalid v3.1 manifest. ${details}`);
  }
  const tracker = await readFile(path.resolve(projectRoot, manifest.paths.audit_tracker), "utf8");
  const [latestReport, latestSession] = await Promise.all([
    latestFile(projectRoot, manifest.paths.reports, ".md"),
    latestFile(projectRoot, manifest.paths.sessions, ".md"),
  ]);
  const digest = renderProjectDigest({
    manifest,
    tracker,
    latestReport,
    latestSession,
    sessionText: latestSession ? await readFile(path.resolve(projectRoot, latestSession), "utf8") : "",
  });
  if (digest.trimEnd().split("\n").length > 30) throw new Error("Project digest exceeds 30 lines");
  const destination = path.join(projectRoot, "PROJECT_STATE.md");
  const temporary = path.join(projectRoot, `.PROJECT_STATE.${process.pid}.tmp`);
  try {
    await writeFile(temporary, digest, { encoding: "utf8", flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return { path: destination, content: digest };
}
