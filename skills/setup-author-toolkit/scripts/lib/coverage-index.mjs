import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";
import { validateCoverageIndex } from "./artifacts.mjs";
import { validateMarkdownReport } from "./markdown.mjs";
import { validateCoverageIndexSchema, validateCoverageUnitSchema, validateRelativePath } from "./schemas.mjs";
import { withProjectWriteLock } from "./write-lock.mjs";
import { validateManifest } from "./manifest.mjs";

function failure(instancePath, message) {
  return { instancePath, keyword: "coverage-registration", message, params: {} };
}

function result(errors) {
  return { valid: errors.length === 0, errors };
}

async function readJson(projectRoot, relativePath, label, errors) {
  if (!validateRelativePath(relativePath).valid || !relativePath.endsWith(".json")) {
    errors.push(failure("", `${label} must be a portable project-relative JSON path`));
    return null;
  }
  const target = path.resolve(projectRoot, relativePath);
  const relative = path.relative(projectRoot, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    errors.push(failure("", `${label} must stay inside the project root`));
    return null;
  }
  try {
    const stats = await lstat(target);
    if (!stats.isFile()) {
      errors.push(failure("", `${label} must name a regular file: ${relativePath}`));
      return null;
    }
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    errors.push(failure("", `cannot read ${label} ${relativePath}: ${error.message}`));
    return null;
  }
}

async function readEntry(projectRoot, entryFile) {
  const errors = [];
  const entry = await readJson(projectRoot, entryFile, "coverage entry", errors);
  if (!entry) return result(errors);
  const schema = validateCoverageIndexSchema({
    schema_version: "1.0.0",
    scope_id: "entry-validation",
    entries: [entry],
    updated_at: "2000-01-01T00:00:00Z",
  });
  for (const error of schema.errors) {
    errors.push({ ...error, instancePath: error.instancePath.replace(/^\/entries\/0/, "") });
  }
  return { ...result(errors), entry };
}

async function validateReportReference(projectRoot, manifest, relativePath, location, operation, scopeId, label) {
  const errors = [];
  if (!validateRelativePath(relativePath).valid || !relativePath.endsWith(".md") ||
      !projectReport(projectRoot, manifest, relativePath)) {
    return [failure(location, `${label} must be Markdown beneath the registered reports path`)];
  }
  try {
    const reportPath = path.resolve(projectRoot, relativePath);
    if (!(await lstat(reportPath)).isFile()) throw new Error("report must be a regular file");
    const report = validateMarkdownReport(await readFile(reportPath, "utf8"));
    errors.push(...report.errors.map((error) => ({
      ...error,
      instancePath: `${location}${error.instancePath}`,
    })));
    if (report.envelope?.stage !== operation) {
      errors.push(failure(location, `${label} stage must match the operation`));
    }
    const reportScope = report.envelope?.engine?.notes?.match(/(?:^|\s)scope_id=([^\s;]+)/)?.[1];
    if (reportScope && reportScope !== scopeId) {
      errors.push(failure(location, `${label} scope_id must match the coverage index`));
    }
  } catch (error) {
    errors.push(failure(location, `cannot read ${label} ${relativePath}: ${error.message}`));
  }
  return errors;
}

function projectReport(projectRoot, manifest, relativePath) {
  const reportsRoot = path.resolve(projectRoot, manifest.paths.reports);
  const target = path.resolve(projectRoot, relativePath);
  return path.dirname(target) === reportsRoot || path.dirname(target).startsWith(`${reportsRoot}${path.sep}`);
}

export async function validateCoverageRegistration(projectRoot, manifest, index, operation) {
  const errors = [];
  const indexValidation = validateCoverageIndex(index);
  errors.push(...indexValidation.errors);
  if (indexValidation.valid && index.scope_id !== manifest.current_scope?.scope_id) {
    errors.push(failure("/scope_id", "coverage index scope_id must match the confirmed current scope"));
  }

  const seenUnits = new Set(index.entries
    .filter((entry) => entry.operation !== operation)
    .flatMap((entry) => entry.units.map((reference) => reference.unit_id)));
  for (const [entryIndex, entry] of index.entries.entries()) {
    if (entry.operation !== operation) continue;
    for (const [unitIndex, reference] of (Array.isArray(entry.units) ? entry.units : []).entries()) {
      const location = `/entries/${entryIndex}/units/${unitIndex}`;
      if (!projectReport(projectRoot, manifest, reference.path)) {
        errors.push(failure(`${location}/path`, "coverage units must be beneath the registered reports path"));
        continue;
      }
      const unit = await readJson(projectRoot, reference.path, "coverage unit", errors);
      if (!unit) continue;
      const schema = validateCoverageUnitSchema(unit);
      errors.push(...schema.errors.map((error) => ({
        ...error,
        instancePath: `${location}${error.instancePath}`,
      })));
      if (seenUnits.has(unit.unit_id)) {
        errors.push(failure(`${location}/unit_id`, `coverage unit ID is referenced more than once: ${unit.unit_id}`));
      }
      seenUnits.add(unit.unit_id);
      if (unit.unit_id !== reference.unit_id || unit.operation !== entry.operation) {
        errors.push(failure(location, "coverage unit ID and operation must match the index reference"));
      }
      if (unit.kind !== "local" || unit.coverage !== "full") {
        errors.push(failure(`${location}/unit_id`, "a coverage index entry composes only full local coverage units"));
      }
      errors.push(...await validateReportReference(
        projectRoot,
        manifest,
        unit.source_report,
        `${location}/source_report`,
        entry.operation,
        unit.scope_id,
        "coverage source report",
      ));
    }
    if (entry.synthesis_report) {
      errors.push(...await validateReportReference(
        projectRoot,
        manifest,
        entry.synthesis_report,
        `/entries/${entryIndex}/synthesis_report`,
        entry.operation,
        index.scope_id,
        "synthesis report",
      ));
    }
  }
  return result(errors);
}

export function composeCoverageIndex(index, entry, scopeId, updatedAt) {
  const entries = (index?.entries ?? []).filter((candidate) => candidate.operation !== entry.operation);
  entries.push(entry);
  return { schema_version: "1.0.0", scope_id: scopeId, entries, updated_at: updatedAt };
}

export async function updateCoverageIndex({ projectRoot, manifestPath, manifest, entryFile, updatedAt = new Date().toISOString() }) {
  if (!manifest.current_scope || manifest.current_scope.status !== "confirmed") {
    throw new Error("coverage index registration requires a confirmed current scope");
  }
  const scopeId = manifest.current_scope.scope_id;
  return withProjectWriteLock(manifestPath, manifest, async () => {
    const recordedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validateManifest(recordedManifest).valid || JSON.stringify(recordedManifest) !== JSON.stringify(manifest)) {
      throw new Error("project manifest changed before coverage index registration; reread it before retrying");
    }
    const entryResult = await readEntry(projectRoot, entryFile);
    if (!entryResult.valid) {
      throw new Error(entryResult.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
    }
    const indexPath = path.posix.join(manifest.paths.reports, "coverage-index.json");
    let previous = null;
    try {
      previous = JSON.parse(await readFile(path.resolve(projectRoot, indexPath), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`cannot read existing coverage index: ${error.message}`);
    }
    if (previous !== null && !validateCoverageIndex(previous).valid) {
      throw new Error("existing coverage index is invalid; reconcile it before registration");
    }
    const index = composeCoverageIndex(previous, entryResult.entry, scopeId, updatedAt);
    const validation = await validateCoverageRegistration(projectRoot, manifest, index, entryResult.entry.operation);
    if (!validation.valid) {
      throw new Error(validation.errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; "));
    }
    const destination = path.resolve(projectRoot, indexPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeJsonAtomic(destination, index);
    return {
      path: indexPath,
      operation: entryResult.entry.operation,
      scope_id: scopeId,
      unit_count: entryResult.entry.units.length,
      synthesis_report: entryResult.entry.synthesis_report,
      synthesis_coverage: entryResult.entry.synthesis_coverage,
      operation_count: index.entries.length,
      updated_at: updatedAt,
    };
  });
}
