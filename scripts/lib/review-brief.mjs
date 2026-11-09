import { splitTrackerRow, trackerDecisions } from "./tracker.mjs";
import { validateRelativePath } from "./schemas.mjs";

const headings = ["Finding ID", "Location", "Decision reason", "Current report"];

function briefError(instancePath, message) {
  return { instancePath, keyword: "review-brief", message, params: {} };
}

function cleanCell(value) {
  return value.trim().replace(/^`([^`]*)`$/, "$1").trim();
}

function reportPath(value) {
  return cleanCell(value.match(/\[[^\]]+\]\(([^)]+)\)/)?.[1] ?? value);
}

function rowsFor(markdown, status) {
  const heading = status === "resolved" ? "Resolved decisions" : "Dismissed decisions";
  const lines = markdown.split(/\r?\n/);
  const starts = lines.flatMap((line, index) => line === `## ${heading}` ? [index] : []);
  if (starts.length !== 1) {
    return {
      errors: [briefError(`/${heading}`, `expected exactly one ## ${heading} heading; found ${starts.length}`)],
      decisions: [],
    };
  }
  const end = lines.findIndex((line, index) => index > starts[0] && /^## /.test(line));
  const section = lines.slice(starts[0] + 1, end === -1 ? lines.length : end);
  const tableIndex = section.findIndex((line) => {
    const cells = splitTrackerRow(line);
    return cells?.length === headings.length && cells.every((cell, index) => cell === headings[index]);
  });
  if (tableIndex === -1 || !/^(\|\s*:?-{3,}:?\s*){4}\|$/.test(section[tableIndex + 1])) {
    return {
      errors: [briefError(`/${heading}`, "expected Finding ID, Location, Decision reason, and Current report columns")],
      decisions: [],
    };
  }
  const errors = [];
  const decisions = [];
  for (const [index, line] of section.slice(tableIndex + 2).entries()) {
    if (!line.trim()) break;
    const row = splitTrackerRow(line);
    if (!row || row.length !== headings.length) {
      errors.push(briefError(`/${heading}/${index}`, "finding row must have four columns"));
      continue;
    }
    const decision = {
      id: cleanCell(row[0]),
      location: cleanCell(row[1]),
      status,
      report: reportPath(row[3]),
      reason: cleanCell(row[2]),
    };
    if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(decision.id)) {
      errors.push(briefError(`/${heading}/${index}/id`, "finding ID must have an uppercase prefix and at least three digits"));
    }
    if (!decision.location || !decision.reason) {
      errors.push(briefError(`/${heading}/${index}`, "location and decision reason are required"));
    }
    if (!validateRelativePath(decision.report).valid) {
      errors.push(briefError(`/${heading}/${index}/report`, "current report must be a portable project-relative path"));
    }
    decisions.push(decision);
  }
  return { errors, decisions };
}

export function validateReviewBrief(markdown, trackerMarkdown) {
  const errors = [];
  if (markdown.split(/\r?\n/).filter((line) => line === "# Review Brief").length !== 1) {
    errors.push(briefError("/title", "expected exactly one # Review Brief heading"));
  }
  const trackerPath = markdown.match(/^- Tracker:\s*`([^`]+)`\s*$/m)?.[1];
  if (!trackerPath || !validateRelativePath(trackerPath).valid) {
    errors.push(briefError("/tracker", "Tracker must be a portable project-relative path"));
  }

  const actual = [];
  for (const status of ["resolved", "dismissed"]) {
    const result = rowsFor(markdown, status);
    errors.push(...result.errors);
    actual.push(...result.decisions);
  }
  if (trackerMarkdown !== undefined) {
    const expected = trackerDecisions(trackerMarkdown);
    const order = (left, right) => left.id.localeCompare(right.id);
    if (JSON.stringify(actual.sort(order)) !== JSON.stringify(expected.sort(order))) {
      errors.push(briefError("/decisions", "resolved and dismissed rows must exactly match the current tracker"));
    }
  }
  return { valid: errors.length === 0, errors };
}
