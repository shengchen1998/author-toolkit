import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parseApprovalPaths } from "./approval-paths.mjs";
import { readProject } from "./evaluation-artifacts.mjs";
import { validateExecutionDecision } from "./execution-decision.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import { validateNoEditDecision } from "./no-edit-decision.mjs";
import { isUninitializedProjectTemplate, projectRootFromManifest } from "./project-files.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { sha256Bytes } from "./state-io.mjs";
import { validateStaleDecision } from "./stale-decision.mjs";
import { validateTimestamp } from "./time.mjs";

export const TRACKER_STATUSES = Object.freeze([
  "open",
  "resolved",
  "deferred",
  "dismissed",
  "stale",
]);

const COLUMN_ALIASES = {
  id: ["finding id", "id"],
  stage: ["stage"],
  audit: ["audit"],
  location: ["location"],
  status: ["status"],
  report: ["current report"],
  updated: ["updated"],
  reason: ["decision or stale reason", "decision reason"],
};

function trackerError(instancePath, message) {
  return { instancePath, keyword: "tracker", message, params: {} };
}

function cleanCell(value = "") {
  return value.trim().replace(/^`([^`]*)`$/, "$1").trim();
}

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  const cells = [];
  let value = "";
  let escaped = false;
  for (const character of trimmed.slice(1, -1)) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
      value += character;
    } else if (character === "|") {
      cells.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

function normalizeHeader(value) {
  return cleanCell(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isSeparator(row) {
  return row?.length > 0 && row.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function findingsSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = lines.flatMap((line, index) =>
    /^ {0,3}##[ \t]+Findings[ \t]*$/.test(line) ? [index] : [],
  );
  if (headings.length !== 1) return { lines, error: headings.length };

  const start = headings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { lines: lines.slice(start, end), start };
}

function pathCell(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("`")) {
    const parsed = parseApprovalPaths(trimmed);
    if (parsed.valid && parsed.paths.length === 1) return parsed.paths[0];
  }
  return cleanCell(trimmed).replace(/\\\|/g, "|");
}

function reportCell(value) {
  const link = value.match(/\[[^\]]+\]\(([^)]+)\)/);
  return pathCell(link?.[1] ?? value);
}

export async function validateTrackerMarkdown(markdown, projectRoot, options = {}) {
  const errors = [];
  const section = findingsSection(markdown);
  if (section.error !== undefined) {
    return {
      valid: false,
      errors: [
        trackerError(
          "/Findings",
          `expected exactly one ## Findings heading; found ${section.error}`,
        ),
      ],
    };
  }

  let headerIndex = -1;
  let columns = null;
  for (let index = 0; index < section.lines.length - 1; index += 1) {
    const header = splitRow(section.lines[index]);
    const separator = splitRow(section.lines[index + 1]);
    if (!header || !isSeparator(separator)) continue;

    const normalized = header.map(normalizeHeader);
    const resolved = {};
    for (const [name, aliases] of Object.entries(COLUMN_ALIASES)) {
      resolved[name] = normalized.findIndex((column) => aliases.includes(column));
    }
    if (Object.values(resolved).every((index) => index >= 0)) {
      headerIndex = index;
      columns = resolved;
      break;
    }
  }

  if (!columns) {
    return {
      valid: false,
      errors: [
        trackerError(
          "/Findings",
          "Findings table requires Finding ID, Stage, Audit, Location, Status, Current report, Updated, and Decision or stale reason columns",
        ),
      ],
    };
  }

  const ids = new Set();
  const dataLines = section.lines.slice(headerIndex + 2);
  for (const [rowIndex, line] of dataLines.entries()) {
    if (!line.trim()) continue;
    const row = splitRow(line);
    if (!row) break;
    const rowPath = `/Findings/${rowIndex}`;
    const get = (name) => cleanCell(row[columns[name]]);
    const id = get("id");
    const status = get("status").toLowerCase();
    const report = reportCell(row[columns.report]);
    const reason = get("reason");

    if (row.length !== Object.keys(columns).length) {
      errors.push(trackerError(rowPath, "finding row has the wrong number of columns"));
      continue;
    }

    for (const field of ["stage", "audit", "location", "updated", "reason"]) {
      if (!get(field)) errors.push(trackerError(`${rowPath}/${field}`, `${field} is required`));
    }
    if (get("updated")) {
      errors.push(...validateTimestamp(get("updated"), `${rowPath}/updated`, options).map((error) => ({
        ...error,
        code: error.keyword,
        keyword: "tracker",
      })));
    }
    if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(id)) {
      errors.push(trackerError(`${rowPath}/id`, "finding ID must have an uppercase prefix and at least three digits"));
    } else if (ids.has(id)) {
      errors.push(trackerError(`${rowPath}/id`, `duplicate finding ID: ${id}`));
    }
    ids.add(id);

    if (!TRACKER_STATUSES.includes(status)) {
      errors.push(
        trackerError(
          `${rowPath}/status`,
          `status must be one of ${TRACKER_STATUSES.join(", ")}; received ${status || "empty"}`,
        ),
      );
    }
    if (/pending|待决定/i.test(reason)) {
      errors.push(trackerError(`${rowPath}/reason`, "record an actual decision or stale reason, not a pending placeholder"));
    }
    if (!report) {
      errors.push(trackerError(`${rowPath}/report`, "current report is required"));
      continue;
    }
    if (!validateRelativePath(report).valid) {
      errors.push(trackerError(`${rowPath}/report`, "current report must be a portable project-relative path"));
      continue;
    }

    try {
      const reportStat = await stat(path.resolve(projectRoot, report));
      if (!reportStat.isFile()) {
        errors.push(trackerError(`${rowPath}/report`, `current report is not a file: ${report}`));
      }
    } catch (error) {
      errors.push(trackerError(`${rowPath}/report`, `current report does not exist: ${report}`));
    }
  }

  return { valid: errors.length === 0, errors };
}

export const APPROVAL_STATUSES = Object.freeze([
  "approved",
  "deferred",
  "cancelled",
  "superseded",
]);

const APPROVAL_COLUMNS = [
  ["id", "approval id"],
  ["type", "type"],
  ["operation", "operation"],
  ["scopeId", "scope id"],
  ["paths", "paths"],
  ["status", "status"],
  ["reason", "reason"],
  ["updated", "updated"],
];

function approvalsSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headings = lines.flatMap((line, index) =>
    /^ {0,3}##[ \t]+Approvals[ \t]*$/.test(line) ? [index] : [],
  );
  if (headings.length !== 1) return { lines, error: headings.length };

  const start = headings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { lines: lines.slice(start, end) };
}

export function validateApprovalsMarkdown(markdown, options = {}) {
  const errors = [];
  const section = approvalsSection(markdown);
  if (section.error !== undefined) {
    return {
      valid: false,
      errors: [
        trackerError(
          "/Approvals",
          `expected exactly one ## Approvals heading; found ${section.error}`,
        ),
      ],
    };
  }

  const tables = [];
  for (let index = 0; index < section.lines.length - 1; index += 1) {
    const header = splitRow(section.lines[index]);
    const separator = splitRow(section.lines[index + 1]);
    if (header && isSeparator(separator)) tables.push({ header, index });
  }
  if (tables.length !== 1) {
    return {
      valid: false,
      errors: [
        trackerError(
          "/Approvals",
          `expected exactly one Approvals table; found ${tables.length}`,
        ),
      ],
    };
  }

  const [{ header, index: headerIndex }] = tables;
  const normalized = header.map(normalizeHeader);
  const columns = Object.fromEntries(
    APPROVAL_COLUMNS.map(([name, label]) => [name, normalized.indexOf(label)]),
  );
  if (
    header.length !== APPROVAL_COLUMNS.length ||
    Object.values(columns).some((index) => index < 0)
  ) {
    return {
      valid: false,
      errors: [
        trackerError(
          "/Approvals",
          "Approvals table requires Approval ID, Type, Operation, Scope ID, Paths, Status, Reason, and Updated columns",
        ),
      ],
    };
  }

  const ids = new Set();
  const dataLines = section.lines.slice(headerIndex + 2);
  for (const [rowIndex, line] of dataLines.entries()) {
    if (!line.trim()) continue;
    const row = splitRow(line);
    if (!row) break;
    const rowPath = `/Approvals/${rowIndex}`;
    const get = (name) => cleanCell(row[columns[name]]);

    if (row.length !== APPROVAL_COLUMNS.length) {
      errors.push(trackerError(rowPath, "approval row has the wrong number of columns"));
      continue;
    }

    const id = get("id");
    if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(id)) {
      errors.push(
        trackerError(
          `${rowPath}/id`,
          "approval ID must have an uppercase prefix and at least three digits",
        ),
      );
    } else if (ids.has(id)) {
      errors.push(trackerError(`${rowPath}/id`, `duplicate approval ID: ${id}`));
    }
    ids.add(id);

    for (const field of ["type", "operation", "scopeId", "paths", "reason", "updated"]) {
      if (!get(field)) errors.push(trackerError(`${rowPath}/${field}`, `${field} is required`));
    }
    if (get("updated")) {
      errors.push(...validateTimestamp(get("updated"), `${rowPath}/updated`, options).map((error) => ({
        ...error,
        code: error.keyword,
        keyword: "tracker",
      })));
    }

    const status = get("status");
    if (!APPROVAL_STATUSES.includes(status)) {
      errors.push(
        trackerError(
          `${rowPath}/status`,
          `status must be one of ${APPROVAL_STATUSES.join(", ")}; received ${status || "empty"}`,
        ),
      );
    }

    const parsedPaths = parseApprovalPaths(row[columns.paths] ?? "");
    if (
      !parsedPaths.valid ||
      parsedPaths.paths.some((value) => !value || !validateRelativePath(value).valid)
    ) {
      errors.push(
        trackerError(
          `${rowPath}/paths`,
          "paths must be comma-separated portable project-relative paths",
        ),
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

const CYCLE_COMPLETION_COLUMNS = [
  ["id", "decision id"],
  ["cycleId", "cycle id"],
  ["scopeFingerprint", "target scope fingerprint"],
  ["status", "status"],
  ["reason", "reason"],
  ["updated", "updated"],
];

function namedSection(markdown, name) {
  const lines = markdown.split(/\r?\n/);
  const headings = lines.flatMap((line, index) =>
    new RegExp(`^ {0,3}##[ \\t]+${name}[ \\t]*$`).test(line) ? [index] : [],
  );
  if (headings.length !== 1) return { lines, error: headings.length };
  const start = headings[0] + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^ {0,3}##[ \t]+/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { lines: lines.slice(start, end), heading: headings[0], error: undefined };
}

function tableWithColumns(lines, definitions) {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = splitRow(lines[index]);
    const separator = splitRow(lines[index + 1]);
    if (!header || !isSeparator(separator)) continue;
    const normalized = header.map(normalizeHeader);
    const columns = Object.fromEntries(
      definitions.map(([name, label]) => [name, normalized.indexOf(label)]),
    );
    if (Object.values(columns).every((column) => column >= 0)) {
      return { header, columns, index };
    }
  }
  return null;
}

function parsedRows(lines, table, definitions) {
  const rows = [];
  for (const line of lines.slice(table.index + 2)) {
    if (!line.trim()) continue;
    const cells = splitRow(line);
    if (!cells) break;
    const row = Object.fromEntries(
      definitions.map(([name]) => [name, cleanCell(cells[table.columns[name]])]),
    );
    row.cellCount = cells.length;
    rows.push(row);
  }
  return rows;
}

function typedFindingDecisionErrors(findings, approvals) {
  const errors = [];
  for (const [index, finding] of findings.entries()) {
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    const decisionTokens = tokens.filter((token) => token.startsWith("author_decision_id="));
    const statusTokens = tokens.filter((token) => token.startsWith("finding_status="));
    if (decisionTokens.length === 0 && statusTokens.length === 0) {
      if (finding.status !== "open") {
        errors.push(trackerError(
          `/Findings/${index}/reason`,
          "every non-open finding requires exactly one author_decision_id and one finding_status token",
        ));
      }
      continue;
    }
    const rowPath = `/Findings/${index}/reason`;
    if (decisionTokens.length !== 1 || statusTokens.length !== 1) {
      errors.push(trackerError(
        rowPath,
        "typed finding decision requires exactly one author_decision_id and one finding_status token",
      ));
      continue;
    }
    const decisionId = decisionTokens[0].slice("author_decision_id=".length);
    const decisionStatus = statusTokens[0].slice("finding_status=".length);
    if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(decisionId)) {
      errors.push(trackerError(rowPath, `typed finding decision has an invalid author decision ID: ${decisionId}`));
    }
    if (finding.status === "open" || decisionStatus !== finding.status) {
      errors.push(trackerError(
        rowPath,
        `typed finding decision status mismatch: row=${finding.status}, token=${decisionStatus}`,
      ));
    }
    if (finding.status !== "stale") {
      const evidenceTypes = tokens.filter((token) => token.startsWith("evidence_type="));
      const allowed = finding.status === "resolved"
        ? ["revision-execution"]
        : ["no-edit-skip", "revision-execution"];
      if (
        evidenceTypes.length !== 1 ||
        !allowed.includes(evidenceTypes[0].slice("evidence_type=".length))
      ) {
        errors.push(trackerError(
          rowPath,
          `finding status ${finding.status} requires one compatible evidence_type token`,
        ));
      }
    }
    const decision = approvals.find((approval) => approval.id === decisionId);
    if (!decision || decision.status !== "approved") {
      errors.push(trackerError(
        rowPath,
        `typed finding decision lacks approved author decision: ${decisionId}`,
      ));
    }
  }
  return errors;
}

function oneDecisionToken(tokens, name) {
  const matches = tokens.filter((token) => token.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}

async function externalStaleDecisionErrors(findings, approvals, projectRoot, options) {
  const candidates = findings.filter((finding) => {
    if (finding.status !== "stale") return false;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    return oneDecisionToken(tokens, "author_decision_id") &&
      oneDecisionToken(tokens, "finding_status") === finding.status;
  });
  if (candidates.length === 0) return [];
  const project = await readProject(projectRoot);
  const errors = [];
  for (const finding of candidates) {
    const rowPath = `/Findings/${findings.indexOf(finding)}/reason`;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    const authorDecisionId = oneDecisionToken(tokens, "author_decision_id");
    const previousReportToken = oneDecisionToken(tokens, "previous_report");
    const previousReportSha256 = oneDecisionToken(tokens, "previous_report_sha256");
    const reportSha256 = oneDecisionToken(tokens, "report_sha256");
    let previousReport = null;
    try {
      previousReport = previousReportToken ? decodeURIComponent(previousReportToken) : null;
    } catch {
    }
    if (
      !previousReport ||
      !validateRelativePath(previousReport).valid ||
      !/^[0-9a-f]{64}$/.test(previousReportSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(reportSha256 ?? "")
    ) {
      errors.push(trackerError(
        rowPath,
        "stale decisions require exact previous_report, previous_report_sha256, and report_sha256 bindings",
      ));
      continue;
    }
    const reportsRoot = project.manifest.paths.reports.replace(/\/$/, "");
    if (
      finding.report !== reportsRoot && !finding.report.startsWith(`${reportsRoot}/`) ||
      previousReport !== reportsRoot && !previousReport.startsWith(`${reportsRoot}/`)
    ) {
      errors.push(trackerError(rowPath, "stale decision reports must be beneath the registered reports path"));
      continue;
    }
    let currentMarkdown;
    let previousMarkdown;
    try {
      [currentMarkdown, previousMarkdown] = await Promise.all([
        readFile(path.resolve(project.root, finding.report), "utf8"),
        readFile(path.resolve(project.root, previousReport), "utf8"),
      ]);
      if (
        sha256Bytes(currentMarkdown) !== reportSha256 ||
        sha256Bytes(previousMarkdown) !== previousReportSha256
      ) {
        throw new Error("stale decision report bytes do not match their recorded hashes");
      }
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
      continue;
    }
    const validation = validateEvidenceReport(currentMarkdown, options);
    const reported = validation.envelope?.findings.find((candidate) => candidate.id === finding.id);
    if (
      !validation.valid ||
      validation.envelope.stage !== finding.stage ||
      reported ||
      !/(?:^|\s)operation_coverage=full(?:\s|$)/.test(validation.envelope.engine.notes)
    ) {
      errors.push(trackerError(
        rowPath,
        "stale decision requires a valid equivalent complete rerun in the same operation that no longer observes the finding",
      ));
      continue;
    }
    try {
      await validateStaleDecision(
        project,
        { approvals },
        {
          finding_id: finding.id,
          status: finding.status,
          report: finding.report,
          author_decision_id: authorDecisionId,
        },
        { envelope: validation.envelope, reported: null },
        finding,
        { ...options, originalReport: previousReport },
      );
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
    }
  }
  return errors;
}

function externalFindingLocation(location) {
  if (location.scope === "file") return location.file;
  if (location.scope === "chapter") return `${location.file}#chapter-${location.chapter}`;
  if (location.scope === "line") return `${location.file}:${location.line}`;
  return `${location.file}: ${location.quote}`;
}

async function externalNoEditDecisionErrors(findings, approvals, projectRoot, options) {
  const candidates = findings.filter((finding) => {
    if (!["deferred", "dismissed"].includes(finding.status)) return false;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    return oneDecisionToken(tokens, "author_decision_id") &&
      oneDecisionToken(tokens, "finding_status") === finding.status &&
      oneDecisionToken(tokens, "evidence_type") === "no-edit-skip";
  });
  if (candidates.length === 0) return [];
  const project = await readProject(projectRoot);
  const errors = [];
  for (const finding of candidates) {
    const rowPath = `/Findings/${findings.indexOf(finding)}/reason`;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    const authorDecisionId = oneDecisionToken(tokens, "author_decision_id");
    const evidenceId = oneDecisionToken(tokens, "evidence_id");
    const evidencePathToken = oneDecisionToken(tokens, "evidence_path");
    const evidenceSha256 = oneDecisionToken(tokens, "evidence_sha256");
    const previousReportToken = oneDecisionToken(tokens, "previous_report");
    const previousReportSha256 = oneDecisionToken(tokens, "previous_report_sha256");
    const reportSha256 = oneDecisionToken(tokens, "report_sha256");
    let evidencePath = null;
    let previousReport = null;
    try {
      evidencePath = evidencePathToken ? decodeURIComponent(evidencePathToken) : null;
      previousReport = previousReportToken ? decodeURIComponent(previousReportToken) : null;
    } catch {
    }
    if (
      !evidenceId ||
      !evidencePath ||
      !validateRelativePath(evidencePath).valid ||
      !/^[0-9a-f]{64}$/.test(evidenceSha256 ?? "") ||
      !previousReport ||
      !validateRelativePath(previousReport).valid ||
      !/^[0-9a-f]{64}$/.test(previousReportSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(reportSha256 ?? "")
    ) {
      errors.push(trackerError(rowPath, "no-edit decisions require complete report and evidence identity bindings"));
      continue;
    }
    let currentMarkdown;
    let previousMarkdown;
    try {
      [currentMarkdown, previousMarkdown] = await Promise.all([
        readFile(path.resolve(project.root, finding.report), "utf8"),
        readFile(path.resolve(project.root, previousReport), "utf8"),
      ]);
      if (
        sha256Bytes(currentMarkdown) !== reportSha256 ||
        sha256Bytes(previousMarkdown) !== previousReportSha256
      ) {
        throw new Error("no-edit decision report bytes do not match their recorded hashes");
      }
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
      continue;
    }
    const validation = validateEvidenceReport(currentMarkdown, options);
    const reported = validation.envelope?.findings.find((candidate) => candidate.id === finding.id);
    if (
      !validation.valid ||
      validation.envelope.stage !== finding.stage ||
      !reported ||
      reported.audit !== finding.audit ||
      externalFindingLocation(reported.location) !== finding.location
    ) {
      errors.push(trackerError(rowPath, "no-edit decision current report does not preserve the exact finding"));
      continue;
    }
    try {
      await validateNoEditDecision(
        project,
        { approvals },
        {
          finding_id: finding.id,
          status: finding.status,
          report: finding.report,
          author_decision_id: authorDecisionId,
          no_edit_skip: { skip_id: evidenceId, path: evidencePath, sha256: evidenceSha256 },
        },
        { envelope: validation.envelope, reported },
        options,
      );
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
    }
  }
  return errors;
}

async function externalExecutionDecisionErrors(findings, approvals, projectRoot, options) {
  const candidates = findings.filter((finding) => {
    if (!["resolved", "deferred", "dismissed"].includes(finding.status)) return false;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    return oneDecisionToken(tokens, "author_decision_id") &&
      oneDecisionToken(tokens, "finding_status") === finding.status &&
      oneDecisionToken(tokens, "evidence_type") === "revision-execution";
  });
  if (candidates.length === 0) return [];
  const project = await readProject(projectRoot);
  const errors = [];
  for (const finding of candidates) {
    const rowPath = `/Findings/${findings.indexOf(finding)}/reason`;
    const tokens = finding.reason.split(/\s+/).filter(Boolean);
    const authorDecisionId = oneDecisionToken(tokens, "author_decision_id");
    const evidenceId = oneDecisionToken(tokens, "evidence_id");
    const evidencePathToken = oneDecisionToken(tokens, "evidence_path");
    const evidenceSha256 = oneDecisionToken(tokens, "evidence_sha256");
    const previousReportToken = oneDecisionToken(tokens, "previous_report");
    const previousReportSha256 = oneDecisionToken(tokens, "previous_report_sha256");
    const reportSha256 = oneDecisionToken(tokens, "report_sha256");
    let evidencePath = null;
    let previousReport = null;
    try {
      evidencePath = evidencePathToken ? decodeURIComponent(evidencePathToken) : null;
      previousReport = previousReportToken ? decodeURIComponent(previousReportToken) : null;
    } catch {
    }
    if (
      !evidenceId ||
      !evidencePath ||
      !validateRelativePath(evidencePath).valid ||
      !/^[0-9a-f]{64}$/.test(evidenceSha256 ?? "") ||
      !previousReport ||
      !validateRelativePath(previousReport).valid ||
      !/^[0-9a-f]{64}$/.test(previousReportSha256 ?? "") ||
      !/^[0-9a-f]{64}$/.test(reportSha256 ?? "")
    ) {
      errors.push(trackerError(rowPath, "execution decisions require complete report and evidence identity bindings"));
      continue;
    }
    let currentMarkdown;
    let previousMarkdown;
    try {
      [currentMarkdown, previousMarkdown] = await Promise.all([
        readFile(path.resolve(project.root, finding.report), "utf8"),
        readFile(path.resolve(project.root, previousReport), "utf8"),
      ]);
      if (
        sha256Bytes(currentMarkdown) !== reportSha256 ||
        sha256Bytes(previousMarkdown) !== previousReportSha256
      ) {
        throw new Error("execution decision report bytes do not match their recorded hashes");
      }
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
      continue;
    }
    const validation = validateEvidenceReport(currentMarkdown, options);
    const reported = validation.envelope?.findings.find((candidate) => candidate.id === finding.id) ?? null;
    if (!validation.valid || validation.envelope.stage !== finding.stage) {
      errors.push(trackerError(rowPath, "execution decision current report is invalid or uses another operation"));
      continue;
    }
    try {
      await validateExecutionDecision(
        project,
        { findings, approvals, valid: true },
        {
          finding_id: finding.id,
          status: finding.status,
          report: finding.report,
          author_decision_id: authorDecisionId,
          revision_execution: { execution_id: evidenceId, path: evidencePath, sha256: evidenceSha256 },
        },
        { envelope: validation.envelope, reported },
        finding,
        options,
      );
    } catch (error) {
      errors.push(trackerError(rowPath, error.message));
    }
  }
  return errors;
}

export async function parseTrackerState(markdown, projectRoot, options = {}) {
  const findingValidation = await validateTrackerMarkdown(markdown, projectRoot, options);
  const approvalValidation = validateApprovalsMarkdown(markdown, options);
  const errors = [...findingValidation.errors, ...approvalValidation.errors];
  const findings = [];
  const findingSection = findingsSection(markdown);
  if (findingSection.error === undefined) {
    const definitions = Object.entries(COLUMN_ALIASES).map(([name, aliases]) => [name, aliases[0]]);
    const table = tableWithColumns(findingSection.lines, definitions);
    if (table) {
      for (const row of parsedRows(findingSection.lines, table, definitions)) {
        row.location = pathCell(row.location);
        row.report = reportCell(row.report);
        row.status = row.status.toLowerCase();
        delete row.cellCount;
        findings.push(row);
      }
    }
  }

  const approvals = [];
  const approvalSection = approvalsSection(markdown);
  if (approvalSection.error === undefined) {
    const table = tableWithColumns(approvalSection.lines, APPROVAL_COLUMNS);
    if (table) {
      for (const row of parsedRows(approvalSection.lines, table, APPROVAL_COLUMNS)) {
        row.paths = parseApprovalPaths(row.paths).paths;
        delete row.cellCount;
        approvals.push(row);
      }
    }
  }

  const completionDecisions = [];
  const completionSection = namedSection(markdown, "Cycle completions");
  if (completionSection.error === undefined) {
    const table = tableWithColumns(completionSection.lines, CYCLE_COMPLETION_COLUMNS);
    if (!table || table.header.length !== CYCLE_COMPLETION_COLUMNS.length) {
      errors.push(trackerError(
        "/Cycle completions",
        "Cycle completions requires Decision ID, Cycle ID, Target scope fingerprint, Status, Reason, and Updated columns",
      ));
    } else {
      const ids = new Set();
      for (const [index, row] of parsedRows(
        completionSection.lines,
        table,
        CYCLE_COMPLETION_COLUMNS,
      ).entries()) {
        const rowPath = `/Cycle completions/${index}`;
        if (row.cellCount !== CYCLE_COMPLETION_COLUMNS.length) {
          errors.push(trackerError(rowPath, "cycle completion row has the wrong number of columns"));
        }
        if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(row.id)) {
          errors.push(trackerError(`${rowPath}/id`, "completion decision ID has an invalid format"));
        } else if (ids.has(row.id)) {
          errors.push(trackerError(`${rowPath}/id`, `duplicate completion decision ID: ${row.id}`));
        }
        ids.add(row.id);
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.cycleId)) {
          errors.push(trackerError(`${rowPath}/cycleId`, "cycle ID has an invalid format"));
        }
        if (!/^[0-9a-f]{64}$/.test(row.scopeFingerprint)) {
          errors.push(trackerError(`${rowPath}/scopeFingerprint`, "target scope fingerprint must be SHA-256"));
        }
        if (!APPROVAL_STATUSES.includes(row.status)) {
          errors.push(trackerError(`${rowPath}/status`, "completion decision status is invalid"));
        }
        if (!row.reason || !row.updated) {
          errors.push(trackerError(rowPath, "completion decision reason and updated time are required"));
        }
        if (row.updated) {
          errors.push(...validateTimestamp(row.updated, `${rowPath}/updated`, options).map((error) => ({
            ...error,
            code: error.keyword,
            keyword: "tracker",
          })));
        }
        delete row.cellCount;
        completionDecisions.push(row);
      }
    }
  } else if (completionSection.error > 1) {
    errors.push(trackerError("/Cycle completions", "expected at most one ## Cycle completions heading"));
  }
  errors.push(...typedFindingDecisionErrors(findings, approvals));
  errors.push(...await externalStaleDecisionErrors(findings, approvals, projectRoot, options));
  errors.push(...await externalNoEditDecisionErrors(findings, approvals, projectRoot, options));
  errors.push(...await externalExecutionDecisionErrors(findings, approvals, projectRoot, options));

  return {
    valid: errors.length === 0,
    errors,
    findings,
    approvals,
    completion_decisions: completionDecisions,
  };
}

function completionCell(value) {
  return String(value).replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

export function appendCycleCompletionDecision(markdown, decision) {
  const section = namedSection(markdown, "Cycle completions");
  const row = `| ${decision.decision_id} | ${decision.cycle_id} | ${decision.scope_fingerprint} | approved | ${completionCell(decision.reason)} | ${decision.updated_at} |\n`;
  if (section.error === undefined) {
    const table = tableWithColumns(section.lines, CYCLE_COMPLETION_COLUMNS);
    if (!table) throw new Error("Cycle completions table is invalid");
    for (const existing of parsedRows(section.lines, table, CYCLE_COMPLETION_COLUMNS)) {
      if (existing.id === decision.decision_id) throw new Error(`Duplicate completion decision: ${decision.decision_id}`);
    }
    const lines = markdown.split(/\r?\n/);
    const separatorIndex = section.heading + 1 + table.index + 1;
    lines.splice(separatorIndex + 1, 0, row.trimEnd());
    return lines.join("\n");
  }

  const block = `## Cycle completions\n\n| Decision ID | Cycle ID | Target scope fingerprint | Status | Reason | Updated |\n|---|---|---|---|---|---|\n${row}\n`;
  const openQuestions = markdown.match(/^ {0,3}##[ \t]+Open questions[ \t]*$/m);
  if (openQuestions?.index !== undefined) {
    return `${markdown.slice(0, openQuestions.index)}${block}\n${markdown.slice(openQuestions.index)}`;
  }
  return `${markdown.trimEnd()}\n\n${block}`;
}

export async function validateTrackerV3Markdown(markdown, projectRoot, options = {}) {
  const state = await parseTrackerState(markdown, projectRoot, options);
  return { valid: state.valid, errors: state.errors };
}

export async function validateTracker(manifest, manifestPath, options = {}) {
  if (isUninitializedProjectTemplate(manifest)) {
    return { valid: true, errors: [] };
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
  try {
    const markdown = await readFile(trackerPath, "utf8");
    return validateTrackerV3Markdown(markdown, projectRoot, options);
  } catch (error) {
    return {
      valid: false,
      errors: [trackerError("/paths/audit_tracker", `cannot read audit tracker: ${error.message}`)],
    };
  }
}
