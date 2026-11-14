import { findingIdentity } from "./finding-identity.mjs";
import { cleanTrackerCell, splitTrackerRow } from "./tracker.mjs";

const HEADING = "Finding history";
const COLUMNS = ["Finding ID", "Stage", "Audit", "Technique", "Issue", "Last report", "Retention"];

function cell(value) {
  const text = String(value).replace(/\r?\n/g, " ").trim();
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const delimiter = "`".repeat(longest + 1);
  return `${delimiter}${text}${delimiter}`;
}

function rows(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${HEADING}`);
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && /^ {0,3}##[ \t]+/.test(line));
  const result = [];
  for (const line of lines.slice(start + 1, end === -1 ? lines.length : end)) {
    const values = splitTrackerRow(line);
    if (!values || values.length !== COLUMNS.length) continue;
    const id = cleanTrackerCell(values[0]);
    if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(id)) continue;
    result.push({
      id,
      stage: cleanTrackerCell(values[1]),
      audit: cleanTrackerCell(values[2]),
      technique: cleanTrackerCell(values[3]),
      issue: cleanTrackerCell(values[4]),
      report: cleanTrackerCell(values[5]),
      retention: cleanTrackerCell(values[6]),
    });
  }
  return result;
}

function error(message) {
  return { instancePath: "/Finding history", keyword: "finding-history", message, params: {} };
}

export function trackerFindingHistory(markdown) {
  return rows(markdown);
}

export function validateTrackerFindingHistory(markdown, currentReports = []) {
  const entries = rows(markdown);
  const byId = new Map();
  const errors = [];
  for (const entry of entries) {
    if (byId.has(entry.id)) errors.push(error(`duplicate finding history ID: ${entry.id}`));
    byId.set(entry.id, entry);
    for (const field of ["stage", "audit", "technique", "issue", "report", "retention"]) {
      if (!entry[field]) errors.push(error(`${entry.id} requires ${field}`));
    }
    if (!["current", "retired"].includes(entry.retention)) {
      errors.push(error(`${entry.id} retention must be current or retired`));
    }
  }
  for (const report of currentReports) {
    for (const finding of report.envelope.findings ?? []) {
      const entry = byId.get(finding.id);
      if (!entry) continue;
      const identity = findingIdentity(report.envelope, finding);
      if (["stage", "audit", "technique", "issue"].some((field) => entry[field] !== identity[field])) {
        errors.push(error(`${finding.id} conflicts with its tracker history identity`));
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function trackerHistoryAsReports(markdown) {
  return rows(markdown).map((entry) => ({
    path: entry.report,
    envelope: {
      stage: entry.stage,
      findings: [{
        id: entry.id,
        audit: entry.audit,
        technique: entry.technique,
        issue: entry.issue,
      }],
    },
  }));
}

export function syncTrackerFindingHistory(markdown, reports, retiredPaths = []) {
  const entries = new Map(rows(markdown).map((entry) => [entry.id, entry]));
  const retired = new Set(retiredPaths);
  for (const report of reports) {
    for (const finding of report.envelope.findings ?? []) {
      const entry = {
        id: finding.id,
        ...findingIdentity(report.envelope, finding),
        report: report.path,
        retention: retired.has(report.path) ? "retired" : "current",
      };
      const previous = entries.get(entry.id);
      if (previous && ["stage", "audit", "technique", "issue"].some((field) => previous[field] !== entry[field])) {
        throw new Error(`conflicting finding history identity: ${entry.id}`);
      }
      if (previous && previous.report !== entry.report) {
        const current = reports.find((candidate) => candidate.path === previous.report);
        if (current && current.envelope.created_at > report.envelope.created_at) continue;
      }
      entries.set(entry.id, entry);
    }
  }
  for (const entry of entries.values()) {
    if (retired.has(entry.report)) entry.retention = "retired";
  }
  const table = [
    `| ${COLUMNS.join(" | ")} |`,
    "|---|---|---|---|---|---|---|",
    ...[...entries.values()].sort((left, right) => left.id.localeCompare(right.id)).map((entry) =>
      `| ${[entry.id, entry.stage, entry.audit, entry.technique, entry.issue, entry.report, entry.retention].map(cell).join(" | ")} |`),
  ];
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${HEADING}`);
  const end = start === -1
    ? lines.findIndex((line) => line.trim() === "## Approvals")
    : lines.findIndex((line, index) => index > start && /^ {0,3}##[ \t]+/.test(line));
  if (start === -1 && end === -1) throw new Error("tracker requires an Approvals section");
  const section = [`## ${HEADING}`, "", ...table, ""];
  lines.splice(start === -1 ? end : start, start === -1 ? 0 : (end === -1 ? lines.length : end) - start, ...section);
  return lines.join(newline);
}
