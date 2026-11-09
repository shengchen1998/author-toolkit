import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { findingIdentity, sameFindingIdentity, validateFindingIdentity } from "./finding-identity.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { splitTrackerRow, trackerFindingRows } from "./tracker.mjs";

export async function readReportFindings(file, projectRoot) {
  const relative = path.relative(projectRoot, path.resolve(file)).replaceAll(path.sep, "/");
  if (!validateRelativePath(relative).valid) {
    throw new Error(`report must be inside the project root: ${file}`);
  }
  const result = validateEvidenceReport(await readFile(file, "utf8"));
  if (!result.valid) {
    throw new Error(`${relative}: ${result.errors.map((error) => error.message).join("; ")}`);
  }
  return { path: relative, envelope: result.envelope };
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.isFile() && /\.(?:md|markdown)$/i.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}

export async function reportFindingIdentities(projectRoot, reportsPath) {
  const reports = [];
  let files;
  try {
    files = await markdownFiles(path.resolve(projectRoot, reportsPath));
  } catch (error) {
    if (error.code === "ENOENT") return reports;
    throw error;
  }
  for (const file of files) {
    const result = validateEvidenceReport(await readFile(file, "utf8"));
    if (result.envelope) reports.push({
      path: path.relative(projectRoot, file).replaceAll(path.sep, "/"),
      envelope: result.envelope,
    });
  }
  return reports;
}

export function validateFindingBatch(reports, trackerMarkdown, history = []) {
  const errors = [];
  const rows = trackerFindingRows(trackerMarkdown);
  for (const report of reports) {
    const related = [
      ...reports.filter((candidate) => candidate.path !== report.path),
      ...history.filter((candidate) => candidate.path !== report.path),
    ];
    const result = validateFindingIdentity(
      report.envelope,
      related.map((candidate) => candidate.envelope),
      rows,
    );
    errors.push(...result.errors.map((error) => ({ ...error, report: report.path })));
  }
  return { valid: errors.length === 0, errors };
}

function codeSpan(value) {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const delimiter = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

function cell(value, code = false) {
  const text = String(value).replace(/\r?\n/g, " ").trim();
  return code || /[|`]/.test(text) ? codeSpan(text) : text;
}

function location(finding) {
  const place = finding.location;
  const scope = place.scope === "chapter"
    ? `chapter ${place.chapter}`
    : place.scope === "line"
      ? `line ${place.line}`
      : place.scope;
  const quote = place.quote ? ` ${place.quote}` : "";
  return `${cell(place.file, true)}, ${cell(`${scope}${quote}`)}`;
}

function trackerTable(lines) {
  const start = lines.findIndex((line) => /^ {0,3}##[ \t]+Findings[ \t]*$/.test(line));
  if (start === -1) throw new Error("tracker requires exactly one ## Findings heading");
  const end = lines.findIndex((line, index) => index > start && /^ {0,3}##[ \t]+/.test(line));
  const stop = end === -1 ? lines.length : end;
  for (let index = start + 1; index < stop - 1; index += 1) {
    const header = splitTrackerRow(lines[index]);
    if (!header || header[0].toLowerCase() !== "finding id") continue;
    const rows = [];
    for (let rowIndex = index + 2; rowIndex < stop; rowIndex += 1) {
      const row = splitTrackerRow(lines[rowIndex]);
      if (!row) break;
      rows.push({ index: rowIndex, cells: row });
    }
    return { rows, end: rows.at(-1)?.index ?? index + 1 };
  }
  throw new Error("tracker Findings table requires a Finding ID header");
}

export function upsertTrackerFindings(markdown, reports, history = []) {
  const validation = validateFindingBatch(reports, markdown, history);
  if (!validation.valid) {
    throw new Error(validation.errors.map((error) => `${error.report}: ${error.message}`).join("; "));
  }
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const table = trackerTable(lines);
  const existing = trackerFindingRows(markdown);
  const rowIndexes = new Map(table.rows.map((row, index) => [existing[index]?.id, row]));
  const inserted = [];
  const updated = [];
  const rows = [];
  for (const report of reports) {
    for (const finding of report.envelope.findings) {
      const old = existing.find((candidate) => candidate.id === finding.id);
      if (old) {
        const current = history.find((candidate) => candidate.path === old.report);
        if (!current) throw new Error(`cannot verify tracker report for ${finding.id}: ${old.report}`);
        const previous = current.envelope.findings.find((candidate) => candidate.id === finding.id);
        if (!previous || !sameFindingIdentity(
          findingIdentity(report.envelope, finding),
          findingIdentity(current.envelope, previous),
        )) {
          throw new Error(`conflicting finding identity: ${finding.id}`);
        }
        const target = rowIndexes.get(finding.id);
        if (!target) throw new Error(`cannot locate tracker row for ${finding.id}`);
        target.cells[3] = location(finding);
        target.cells[5] = cell(report.path, true);
        lines[target.index] = `| ${target.cells.map((value) => value.trim()).join(" | ")} |`;
        updated.push(finding.id);
      } else {
        rows.push(`| ${[
          finding.id,
          report.envelope.stage,
          finding.audit,
          location(finding),
          "open",
          cell(report.path, true),
          report.envelope.created_at,
          "No author decision recorded.",
        ].join(" | ")} |`);
        inserted.push(finding.id);
      }
    }
  }
  lines.splice(table.end + 1, 0, ...rows);
  return { markdown: lines.join(newline), inserted, updated };
}
