import { constants } from "node:fs";
import { copyFile, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  reportEvidenceValue,
  validateEvidenceReport,
  validateMarkdownReport,
} from "./markdown.mjs";
import { readIntakeInventory } from "./intake-inventory.mjs";
import { validateScopeCurrency } from "./project-files.mjs";
import { validateRelativePath } from "./schemas.mjs";
import { splitTrackerRow } from "./tracker.mjs";

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

export function applyReportPreset({ manifest, envelope, preset, scopeId, inputPaths = [] }) {
  const scope = manifest.current_scope;
  if (!scope) throw reportError("report preset requires a current scope in the manifest");
  if (scope.scope_id !== scopeId) {
    throw reportError("--scope-id must match the manifest's current scope");
  }

  const scopeFiles = new Map(scope.files.map((file) => [file.path, file]));
  const selectedPaths = inputPaths.length > 0 ? inputPaths : scope.files.map((file) => file.path);
  const seen = new Set();
  const scopeInputs = selectedPaths.map((inputPath) => {
    if (!validateRelativePath(inputPath).valid) {
      throw reportError("--input must be a portable project-relative path");
    }
    if (seen.has(inputPath)) throw reportError(`duplicate report input: ${inputPath}`);
    seen.add(inputPath);
    const file = scopeFiles.get(inputPath);
    if (!file) throw reportError(`--input is not in the current scope: ${inputPath}`);
    return { path: file.path, version: file.sha256, version_type: "sha256" };
  });

  const additionalInputs = envelope.inputs ?? [];
  if (!Array.isArray(additionalInputs)) {
    throw reportError("envelope.inputs must be an array of additional inputs with --preset");
  }
  for (const input of additionalInputs) {
    if (input && typeof input === "object" && typeof input.path === "string") {
      if (seen.has(input.path)) throw reportError(`duplicate report input: ${input.path}`);
      seen.add(input.path);
    }
  }

  const generated = {
    schema_version: "2.0.0",
    stage: preset,
    language: manifest.language,
  };
  for (const [field, value] of Object.entries(generated)) {
    if (field in envelope && envelope[field] !== value) {
      throw reportError(`envelope.${field} conflicts with --preset`);
    }
  }

  let engine = envelope.engine;
  if (engine && typeof engine === "object" && !Array.isArray(engine) && typeof engine.notes === "string") {
    const recordedScope = reportEvidenceValue(engine.notes, "scope_id");
    if (recordedScope && recordedScope !== scopeId) {
      throw reportError("envelope.engine.notes scope_id conflicts with --scope-id");
    }
    engine = {
      ...engine,
      notes: recordedScope ? engine.notes : `scope_id=${scopeId}; ${engine.notes}`,
    };
  }

  return {
    ...envelope,
    ...generated,
    inputs: [...scopeInputs, ...additionalInputs],
    ...(engine ? { engine } : {}),
  };
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

async function resolveSkill(envelope, setupRoot) {
  const skill = envelope.skill;
  if (!skill || typeof skill !== "object" || Array.isArray(skill) || typeof skill.name !== "string") {
    throw reportError("envelope.skill.name must identify the executing skill");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) {
    throw reportError("envelope.skill.name must be a lowercase hyphenated skill name");
  }
  const skillFile = path.join(setupRoot, "..", skill.name, "SKILL.md");
  let text;
  try {
    const stats = await lstat(skillFile);
    if (!stats.isFile()) throw new Error("not a regular file");
    text = await readFile(skillFile, "utf8");
  } catch (error) {
    throw reportError(`executing skill metadata is missing or unreadable: ${skill.name}: ${error.message}`);
  }
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
  const version = frontmatter?.[1].match(/^version: ([^\s]+)$/m)?.[1];
  if (!version) {
    throw reportError(`executing skill must declare version in SKILL.md frontmatter: ${skill.name}`);
  }
  if ("version" in skill && skill.version !== version) {
    throw reportError(`envelope.skill.version conflicts with the installed ${skill.name} version ${version}`);
  }
  return { ...envelope, skill: { ...skill, version } };
}

async function assertReviseDraftIntakeBody(body, setupRoot) {
  const templateFile = path.join(setupRoot, "..", "revise-draft", "assets", "intake-report-template.md");
  let template;
  try {
    const stats = await lstat(templateFile);
    if (!stats.isFile()) throw new Error("not a regular file");
    template = await readFile(templateFile, "utf8");
  } catch (error) {
    throw reportError(`revise-draft intake template is missing or unreadable: ${error.message}`);
  }

  const markers = template.split(/\r?\n/).flatMap((line) => {
    const label = line.match(/^- [^:]+:/)?.[0];
    return label ? [label] : /^## \S/.test(line) ? [line] : [];
  });
  if (markers.length === 0) {
    throw reportError("revise-draft intake template declares no body labels or level-two headings");
  }
  const bodyLines = body.split(/\r?\n/);
  const missing = markers.filter((marker) => !bodyLines.some((line) =>
    marker.startsWith("- ") ? line.startsWith(marker) : line.trimEnd() === marker));
  if (missing.length > 0) {
    throw reportError(`revise-draft intake body is missing required template markers: ${missing.join("; ")}`);
  }
}

function intakeInventoryRows(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimEnd() === "## Manuscript inventory");
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## \S/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const section = lines.slice(start + 1, end);
  const expectedHeader = ["order", "path", "characters", "sha-256"];
  const headers = section.flatMap((line, index) => {
    const row = splitTrackerRow(line);
    return row?.map((cell) => cell.trim().toLowerCase()).join("|") === expectedHeader.join("|")
      ? [index]
      : [];
  });
  if (headers.length !== 1) {
    throw reportError("revise-draft intake body must contain exactly one manuscript inventory table");
  }
  const header = headers[0];
  const separator = splitTrackerRow(section[header + 1] ?? "");
  if (separator?.length !== 4 || !separator.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) {
    throw reportError("revise-draft intake manuscript inventory table has an invalid separator");
  }
  return section.slice(header + 2).flatMap((line) => {
    const row = splitTrackerRow(line);
    if (!row) return [];
    if (row.length !== 4) {
      throw reportError("revise-draft intake manuscript inventory rows must have four cells");
    }
    return [row];
  });
}

function intakeInventoryPath(cell) {
  const trimmed = cell.trim();
  const delimiter = trimmed.match(/^`+/)?.[0];
  if (!delimiter) return trimmed.replace(/\\\|/g, "|");
  if (!trimmed.endsWith(delimiter) || trimmed.length < delimiter.length * 2) {
    throw reportError("revise-draft intake manuscript inventory has an unclosed path code span");
  }
  let value = trimmed.slice(delimiter.length, -delimiter.length);
  if (delimiter.length > 1 && value.startsWith(" ") && value.endsWith(" ")) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\\|/g, "|");
}

async function assertReviseDraftIntakeInventory({
  body,
  projectRoot,
  manifestPath,
  manifest,
  inputPaths,
}) {
  if (inputPaths.length > 0) {
    throw reportError("revise-draft intake requires every current-scope file; omit --input");
  }
  const scope = manifest.current_scope;
  const currency = await validateScopeCurrency(manifest, manifestPath);
  if (!currency.valid) {
    throw reportError(`revise-draft intake current scope is stale: ${currency.errors.map((error) => error.message).join("; ")}`);
  }
  const inventory = await readIntakeInventory({ projectRoot, manifest });
  const currentFiles = new Map(inventory.files.map((file) => [file.path, file]));
  if (inventory.files.length !== scope.files.length || scope.files.some((file) => !currentFiles.has(file.path))) {
    throw reportError("revise-draft intake current scope does not match the current manuscript inventory");
  }
  for (const file of scope.files) {
    if (currentFiles.get(file.path).sha256 !== file.sha256) {
      throw reportError(`revise-draft intake manuscript changed during report scaffolding: ${file.path}`);
    }
  }

  const rows = intakeInventoryRows(body);
  const seen = new Set();
  for (const row of rows) {
    const file = intakeInventoryPath(row[1]);
    if (seen.has(file)) throw reportError(`duplicate revise-draft intake manuscript row: ${file}`);
    seen.add(file);
  }
  if (rows.length !== scope.files.length) {
    throw reportError(`revise-draft intake manuscript row count does not match current scope: expected ${scope.files.length}, received ${rows.length}`);
  }
  for (const [index, row] of rows.entries()) {
    const expected = scope.files[index];
    const current = currentFiles.get(expected.path);
    const actualPath = intakeInventoryPath(row[1]);
    if (row[0].trim() !== `${index + 1}` || actualPath !== expected.path) {
      throw reportError(`revise-draft intake manuscript row ${index + 1} does not match current-scope reading order and path: ${expected.path}`);
    }
    if (row[2].trim() !== `${current.characters}`) {
      throw reportError(`revise-draft intake character count does not match current manuscript: ${expected.path}`);
    }
    if (row[3].trim() !== current.sha256) {
      throw reportError(`revise-draft intake SHA-256 does not match current manuscript: ${expected.path}`);
    }
  }
}

export async function writeScaffoldedReport({
  projectRoot,
  manifestPath,
  setupRoot,
  manifest,
  destination,
  bodyFile,
  envelopeFile,
  createdAt,
  preset,
  scopeId,
  inputPaths,
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
  const versionedEnvelope = await resolveSkill(envelope, setupRoot);
  if ("created_at" in envelope && createdAt !== undefined && envelope.created_at !== createdAt) {
    throw reportError("--created-at conflicts with envelope.created_at");
  }
  const resolvedEnvelope = preset
    ? applyReportPreset({ manifest, envelope: versionedEnvelope, preset, scopeId, inputPaths })
    : versionedEnvelope;
  if (preset === "intake" && versionedEnvelope.skill.name === "revise-draft") {
    await assertReviseDraftIntakeBody(body, setupRoot);
    await assertReviseDraftIntakeInventory({
      body,
      projectRoot,
      manifestPath,
      manifest,
      inputPaths,
    });
  }
  const result = scaffoldReport({ body, envelope: resolvedEnvelope, createdAt });

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
