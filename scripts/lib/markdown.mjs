import { validateReportEnvelope } from "./schemas.mjs";

export class ReportEnvelopeError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReportEnvelopeError";
    this.code = "ERR_REPORT_ENVELOPE";
  }
}

function scanMarkdownLines(markdown, visit) {
  let fence = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,})[ \t]*$/);
      if (closing && closing[1].length >= fence.length) {
        visit({ line, type: "closing", fence });
        fence = null;
      } else {
        visit({ line, type: "content", fence });
      }
      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,})([^`]*)$/);
    if (opening) {
      const info = opening[2].trim().split(/[ \t]+/)[0]?.toLowerCase();
      fence = { length: opening[1].length, info };
      visit({ line, type: "opening", fence });
    } else {
      visit({ line, type: "text", fence: null });
    }
  }

  return fence;
}

export function extractReportEnvelope(markdown) {
  if (typeof markdown !== "string") {
    throw new ReportEnvelopeError("Markdown input must be a string");
  }

  const blocks = [];
  let jsonLines = [];
  const unclosed = scanMarkdownLines(markdown, ({ line, type, fence }) => {
    if (type === "opening") {
      jsonLines = [];
    } else if (type === "closing") {
      if (fence.info === "json") blocks.push(jsonLines.join("\n"));
      jsonLines = [];
    } else if (type === "content" && fence.info === "json") {
      jsonLines.push(line);
    }
  });

  if (unclosed?.info === "json") {
    throw new ReportEnvelopeError("The JSON report envelope has no closing fence");
  }
  if (blocks.length === 0) {
    throw new ReportEnvelopeError("Expected exactly one fenced JSON report envelope; found none");
  }
  if (blocks.length !== 1) {
    throw new ReportEnvelopeError(
      `Expected exactly one fenced JSON report envelope; found ${blocks.length}`,
    );
  }

  try {
    return JSON.parse(blocks[0]);
  } catch (error) {
    throw new ReportEnvelopeError(`Report envelope is not valid JSON: ${error.message}`);
  }
}

export function languageCoverageHeadingCount(markdown) {
  let count = 0;
  scanMarkdownLines(markdown, ({ line, type }) => {
    if (type === "text" && /^ {0,3}##[ \t]+Language coverage(?:[ \t]+#+)?[ \t]*$/.test(line)) {
      count += 1;
    }
  });
  return count;
}

export function validateMarkdownReport(markdown) {
  let envelope;
  try {
    envelope = extractReportEnvelope(markdown);
  } catch (error) {
    if (!(error instanceof ReportEnvelopeError)) throw error;
    return {
      valid: false,
      errors: [{ instancePath: "", keyword: "markdown", message: error.message, params: {} }],
    };
  }

  const result = validateReportEnvelope(envelope);
  const errors = [...result.errors];
  const coverageHeadings = languageCoverageHeadingCount(markdown);
  if (coverageHeadings !== 1) {
    errors.push({
      instancePath: "",
      keyword: "language-coverage",
      message: `Expected exactly one ## Language coverage heading; found ${coverageHeadings}`,
      params: {},
    });
  }

  const engineNotes = envelope.engine?.notes ?? "";
  const hasCoverageSummary =
    /\bcoverage\s*(?:[:=]|is)\s*(full|partial|skipped)\b/i.test(engineNotes) ||
    /\b(full|partial|skipped)\b[^.\n]{0,120}\bcoverage\b/i.test(engineNotes);
  if (!hasCoverageSummary) {
    errors.push({
      instancePath: "/engine/notes",
      keyword: "language-coverage",
      message: "engine.notes must contain a coverage summary: full, partial, or skipped",
      params: {},
    });
  }

  return { valid: errors.length === 0, errors, envelope };
}
