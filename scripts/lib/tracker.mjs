import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parseApprovalPaths } from "./approval-paths.mjs";
import { isUninitializedProjectTemplate, projectRootFromManifest } from "./project-files.mjs";
import { validateRelativePath } from "./schemas.mjs";

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

function reportCell(value) {
  const link = value.match(/\[[^\]]+\]\(([^)]+)\)/);
  return cleanCell(link?.[1] ?? value);
}

export async function validateTrackerMarkdown(markdown, projectRoot) {
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

export function validateApprovalsMarkdown(markdown) {
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

export async function validateTrackerV3Markdown(markdown, projectRoot) {
  const findings = await validateTrackerMarkdown(markdown, projectRoot);
  const approvals = validateApprovalsMarkdown(markdown);
  const errors = [...findings.errors, ...approvals.errors];
  return { valid: errors.length === 0, errors };
}

export async function validateTracker(manifest, manifestPath) {
  if (isUninitializedProjectTemplate(manifest)) {
    return { valid: true, errors: [] };
  }

  const projectRoot = projectRootFromManifest(manifestPath);
  const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
  try {
    const markdown = await readFile(trackerPath, "utf8");
    return manifest.schema_version === "3.0.0"
      ? await validateTrackerV3Markdown(markdown, projectRoot)
      : await validateTrackerMarkdown(markdown, projectRoot);
  } catch (error) {
    return {
      valid: false,
      errors: [trackerError("/paths/audit_tracker", `cannot read audit tracker: ${error.message}`)],
    };
  }
}
