import { cleanTrackerCell, splitTrackerRow } from "./tracker.mjs";

const ID_PATTERN = /^O-\d{3,}$/;
const OBSERVED = "Observed in the text";
const INFERRED = "Inferred from the text";
const UNKNOWN = "Unknown or unwritten";
const REVIEW = "Source-fidelity review";
const DISPOSITIONS = new Set([
  "keep",
  "revise",
  `move to ${INFERRED}`,
  `move to ${UNKNOWN}`,
]);
const REVIEW_HEADINGS = [
  "Assertion ID",
  "Drafted observed assertion",
  "Manuscript path and line or short passage, or no direct support",
  "Disposition",
  "Resulting statement or destination",
];

function baselineError(instancePath, message) {
  return { instancePath, keyword: "draft-baseline", message, params: {} };
}

function section(lines, heading, errors) {
  const starts = lines.flatMap((line, index) => line === `## ${heading}` ? [index] : []);
  if (starts.length !== 1) {
    errors.push(baselineError(`/${heading}`, `expected exactly one ## ${heading} heading; found ${starts.length}`));
    return [];
  }
  const end = lines.findIndex((line, index) => index > starts[0] && /^## /.test(line));
  return lines.slice(starts[0] + 1, end === -1 ? lines.length : end);
}

function table(lines, heading, headings, errors) {
  const tableIndex = lines.findIndex((line) => {
    const cells = splitTrackerRow(line);
    return cells?.length === headings.length && cells.every((cell, index) => cell === headings[index]);
  });
  const separator = splitTrackerRow(lines[tableIndex + 1] ?? "");
  if (
    tableIndex === -1 ||
    separator?.length !== headings.length ||
    !separator.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    errors.push(baselineError(`/${heading}`, `expected the ${headings.join(", ")} table`));
    return [];
  }
  const rows = [];
  for (const [index, line] of lines.slice(tableIndex + 2).entries()) {
    if (!line.trim()) break;
    const cells = splitTrackerRow(line);
    if (!cells || cells.length !== headings.length) {
      errors.push(baselineError(`/${heading}/${index}`, `row must have ${headings.length} columns`));
      continue;
    }
    rows.push({ cells, index });
  }
  return rows;
}

function registerLocation(locations, id, heading, index, errors) {
  if (locations.has(id)) {
    errors.push(baselineError(`/${heading}/${index}/id`, `duplicate final assertion ID: ${id}`));
    return;
  }
  locations.set(id, { heading, index });
}

function observedIds(lines, locations, errors) {
  let subsection = false;
  for (const [index, line] of lines.entries()) {
    if (/^### /.test(line)) {
      subsection = true;
      continue;
    }
    if (!subsection || !line.trim()) continue;
    const match = line.match(/^- \[(O-\d{3,})\]\s+(\S.*)$/);
    if (!match) {
      errors.push(baselineError(
        `/${OBSERVED}/${index}`,
        "each assertion must be one single-line bullet in the form - [O-NNN] assertion",
      ));
      continue;
    }
    registerLocation(locations, match[1], OBSERVED, index, errors);
  }
}

function destinationIds(lines, heading, headings, locations, errors) {
  const rows = table(lines, heading, headings, errors);
  for (const { cells, index } of rows) {
    const id = cleanTrackerCell(cells[0]);
    if (id === "—") continue;
    if (!ID_PATTERN.test(id)) {
      errors.push(baselineError(`/${heading}/${index}/id`, "Source ID must be O-NNN or — for an unrelated entry"));
      continue;
    }
    if (!cleanTrackerCell(cells[1])) {
      errors.push(baselineError(`/${heading}/${index}`, "a moved assertion requires destination content"));
    }
    registerLocation(locations, id, heading, index, errors);
  }
}

export function validateDraftBaseline(markdown) {
  const errors = [];
  const lines = markdown.split(/\r?\n/);
  const locations = new Map();
  observedIds(section(lines, OBSERVED, errors), locations, errors);
  destinationIds(section(lines, INFERRED, errors), INFERRED, [
    "Source ID",
    "Interpretation",
    "Evidence paths",
    "Alternative or uncertainty",
    "Author decision",
  ], locations, errors);
  destinationIds(section(lines, UNKNOWN, errors), UNKNOWN, [
    "Source ID",
    "Topic",
    "Current status",
    "Effect on current-text diagnosis",
  ], locations, errors);

  const reviewRows = table(section(lines, REVIEW, errors), REVIEW, REVIEW_HEADINGS, errors);
  const reviewed = new Map();
  for (const { cells, index } of reviewRows) {
    const id = cleanTrackerCell(cells[0]);
    const instancePath = `/${REVIEW}/${index}`;
    if (!ID_PATTERN.test(id)) {
      errors.push(baselineError(`${instancePath}/id`, "Assertion ID must use O-NNN"));
      continue;
    }
    if (reviewed.has(id)) {
      errors.push(baselineError(`${instancePath}/id`, `duplicate review row for ${id}`));
      continue;
    }
    const disposition = cleanTrackerCell(cells[3]);
    const result = cleanTrackerCell(cells[4]);
    if (!cleanTrackerCell(cells[1])) {
      errors.push(baselineError(`${instancePath}/assertion`, "drafted observed assertion is required"));
    }
    if (!cleanTrackerCell(cells[2])) {
      errors.push(baselineError(`${instancePath}/support`, "manuscript support or its absence is required"));
    }
    if (!DISPOSITIONS.has(disposition)) {
      errors.push(baselineError(`${instancePath}/disposition`, `unsupported disposition: ${disposition || "(empty)"}`));
    }
    if (disposition !== "keep" && (!result || result === "—")) {
      errors.push(baselineError(`${instancePath}/result`, "revise and move require a resulting statement or destination"));
    }
    reviewed.set(id, { disposition, index });
  }

  for (const id of locations.keys()) {
    if (!reviewed.has(id)) {
      errors.push(baselineError(`/${REVIEW}`, `missing review row for ${id}`));
    }
  }
  for (const [id, review] of reviewed) {
    const location = locations.get(id);
    if (!location) {
      errors.push(baselineError(`/${REVIEW}/${review.index}/id`, `reviewed assertion ${id} has no recorded destination`));
      continue;
    }
    const expected = review.disposition === `move to ${INFERRED}`
      ? INFERRED
      : review.disposition === `move to ${UNKNOWN}`
        ? UNKNOWN
        : OBSERVED;
    if (DISPOSITIONS.has(review.disposition) && location.heading !== expected) {
      errors.push(baselineError(
        `/${REVIEW}/${review.index}/disposition`,
        `${review.disposition} does not match the recorded location ${location.heading}`,
      ));
    }
  }
  return { valid: errors.length === 0, errors };
}
