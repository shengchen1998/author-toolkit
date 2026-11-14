import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { validateEvidenceReport, validateMarkdownReport } from "./markdown.mjs";
import { validateRelativePath } from "./schemas.mjs";

function reportError(message) {
  const error = new Error(message);
  error.code = "ERR_REPORT_SCAFFOLD";
  return error;
}

function checkResult(result) {
  if (!result.valid) {
    const diagnostics = result.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw reportError(`report validation failed: ${diagnostics}`);
  }
  return result;
}

export function scaffoldReport({ body, envelope, createdAt }) {
  if ("findings" in envelope && !Array.isArray(envelope.findings)) {
    throw reportError("envelope.findings must be an array");
  }
  const resolved = {
    ...envelope,
    created_at: createdAt ?? envelope.created_at ?? new Date().toISOString(),
    findings: envelope.findings ?? [],
  };
  const markdown = `${body.trimEnd()}\n\n\`\`\`json\n${JSON.stringify(resolved, null, 2)}\n\`\`\`\n`;
  const validation = checkResult(
    ["draft-baseline", "diagnostics", "current-scope-review", "final-review"].includes(
      resolved.stage,
    )
      ? validateEvidenceReport(markdown)
      : validateMarkdownReport(markdown),
  );
  return { markdown, envelope: validation.envelope };
}

export function resolveReportDestination(projectRoot, manifest, destination) {
  if (!validateRelativePath(destination).valid || !destination.endsWith(".md")) {
    throw reportError("--output must be a portable project-relative Markdown path");
  }
  const reportsRoot = path.resolve(projectRoot, manifest.paths.reports);
  const target = path.resolve(projectRoot, destination);
  if (path.dirname(target) !== reportsRoot && !path.dirname(target).startsWith(`${reportsRoot}${path.sep}`)) {
    throw reportError("report destination must be beneath the registered reports path");
  }
  return { reportsRoot, target };
}

async function assertAbsent(target) {
  try {
    await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw reportError(`report destination already exists: ${target}`);
}

async function assertRegularInput(file) {
  let stats;
  try {
    stats = await lstat(file);
  } catch (error) {
    throw reportError(`input is missing or unreadable: ${file}: ${error.message}`);
  }
  if (!stats.isFile()) throw reportError(`input must be a regular file: ${file}`);
  return file;
}

export async function writeScaffoldedReport({
  projectRoot,
  manifest,
  destination,
  bodyFile,
  envelopeFile,
  createdAt,
}) {
  const { reportsRoot, target } = resolveReportDestination(projectRoot, manifest, destination);
  await Promise.all([assertAbsent(target), assertRegularInput(bodyFile), assertRegularInput(envelopeFile)]);
  const [body, envelopeText] = await Promise.all([
    readFile(bodyFile, "utf8"),
    readFile(envelopeFile, "utf8"),
  ]);
  if (!body.trim()) throw reportError("report body must not be empty");
  if (/(^|\n) {0,3}```/.test(body)) {
    throw reportError("report body must not contain fenced code blocks; the CLI adds the report envelope");
  }
  let envelope;
  try {
    envelope = JSON.parse(envelopeText);
  } catch (error) {
    throw reportError(`envelope must be valid JSON: ${error.message}`);
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw reportError("envelope must be one JSON object");
  }
  if ("created_at" in envelope && createdAt !== undefined && envelope.created_at !== createdAt) {
    throw reportError("--created-at conflicts with envelope.created_at");
  }
  const result = scaffoldReport({ body, envelope, createdAt });

  await assertAbsent(target);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, result.markdown, { encoding: "utf8", flag: "wx" });
    if (await readFile(temporary, "utf8") !== result.markdown) {
      throw reportError("temporary report verification failed");
    }
    await copyFile(temporary, target, constants.COPYFILE_EXCL);
    if (await readFile(target, "utf8") !== result.markdown) {
      await rm(target, { force: true });
      throw reportError("published report verification failed");
    }
  } finally {
    await rm(temporary, { force: true });
  }
  return {
    path: destination,
    absolute_path: target,
    reports_root: reportsRoot,
    report_id: result.envelope.report_id,
    stage: result.envelope.stage,
    created_at: result.envelope.created_at,
    finding_count: result.envelope.findings.length,
  };
}
