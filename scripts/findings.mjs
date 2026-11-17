#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  allocateFindingIds,
  readReportFindings,
  reportFindingIdentities,
  projectRootFromManifest,
  trackerFindingRows,
  upsertTrackerAuditRuns,
  upsertTrackerFindings,
  trackerFindingHistory,
  validateManifest,
  validateTrackerV3Markdown,
  validateTrackerFindingIds,
} from "./lib/index.mjs";
import { withProjectWriteLock } from "./lib/write-lock.mjs";

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/findings.mjs next-finding-id PREFIX --manifest FILE [--count N]
  node scripts/findings.mjs record-findings --manifest FILE --report FILE...

Allocate IDs from all tracker and immutable-report history. Record a complete
report batch under the shared write lock, atomically upserting finding and
Audit runs rows while preserving finding decisions and timestamps.`);
}

function options(args) {
  const result = { reports: [] };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--manifest" && args[index + 1]) result.manifest = path.resolve(args[++index]);
    else if (args[index] === "--count" && args[index + 1]) result.count = Number(args[++index]);
    else if (args[index] === "--report" && args[index + 1]) result.reports.push(path.resolve(args[++index]));
    else {
      throw argumentError(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return result;
}

async function recordFindings(selection, manifest) {
  const projectRoot = projectRootFromManifest(selection.manifest);
  return withProjectWriteLock(selection.manifest, manifest, async () => {
    const recordedManifest = JSON.parse(await readFile(selection.manifest, "utf8"));
    if (!validateManifest(recordedManifest).valid || JSON.stringify(recordedManifest) !== JSON.stringify(manifest)) {
      throw new Error("project manifest changed before finding recording; reread it before retrying");
    }
    const trackerPath = path.resolve(projectRoot, recordedManifest.paths.audit_tracker);
    const tracker = await readFile(trackerPath, "utf8");
    const trackerValidation = validateTrackerFindingIds(tracker);
    if (!trackerValidation.valid) throw new Error(trackerValidation.errors.map((error) => error.message).join("; "));
    const history = await reportFindingIdentities(projectRoot, recordedManifest.paths.reports);
    const bounded = recordedManifest.evidence_retention?.mode === "bounded";
    const reportsRoot = path.resolve(projectRoot, recordedManifest.paths.reports);
    const reports = [];
    for (const file of selection.reports) {
      const report = await readReportFindings(file, projectRoot);
      if (path.dirname(file) !== reportsRoot && !path.dirname(file).startsWith(`${reportsRoot}${path.sep}`)) {
        throw new Error(`report must be beneath registered reports path: ${report.path}`);
      }
      reports.push(report);
    }

    const findings = upsertTrackerFindings(tracker, reports, history, { bounded });
    const auditRuns = upsertTrackerAuditRuns(findings.markdown, reports);
    const validation = await validateTrackerV3Markdown(auditRuns.markdown, projectRoot);
    if (!validation.valid) throw new Error(validation.errors.map((error) => error.message).join("; "));
    const temporary = `${trackerPath}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, auditRuns.markdown, "utf8");
      if (await readFile(temporary, "utf8") !== auditRuns.markdown) {
        throw new Error("temporary tracker verification failed");
      }
      await rename(temporary, trackerPath);
      if (await readFile(trackerPath, "utf8") !== auditRuns.markdown) {
        throw new Error("published tracker verification failed");
      }
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return {
      inserted: findings.inserted,
      updated: findings.updated,
      audit_runs: { inserted: auditRuns.inserted, updated: auditRuns.updated },
    };
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const operation = args.shift();
  const prefix = operation === "next-finding-id" ? args.shift() : undefined;
  const selection = options(args);
  if (!selection.manifest || !["next-finding-id", "record-findings"].includes(operation)) {
    throw argumentError("expected next-finding-id PREFIX or record-findings, plus --manifest FILE");
  }
  if (operation === "next-finding-id") {
    if (!prefix || !/^[A-Z][A-Z0-9]*$/.test(prefix) || selection.reports.length > 0) {
      throw argumentError("next-finding-id requires one uppercase PREFIX and no --report");
    }
    if (!Number.isInteger(selection.count ?? 1) || (selection.count ?? 1) < 1) throw argumentError("count must be a positive integer");
  } else if (selection.reports.length === 0 || selection.count !== undefined) {
    throw argumentError("record-findings requires at least one --report and no --count");
  }

  const projectRoot = projectRootFromManifest(selection.manifest);
  const manifest = JSON.parse(await readFile(selection.manifest, "utf8"));
  if (!validateManifest(manifest).valid) {
    throw new Error("findings tools require a valid v3.1 project manifest");
  }
  if (operation === "next-finding-id") {
    const trackerPath = path.resolve(projectRoot, manifest.paths.audit_tracker);
    const tracker = await readFile(trackerPath, "utf8");
    const trackerValidation = validateTrackerFindingIds(tracker);
    if (!trackerValidation.valid) throw new Error(trackerValidation.errors.map((error) => error.message).join("; "));
    const history = await reportFindingIdentities(projectRoot, manifest.paths.reports);
    const bounded = manifest.evidence_retention?.mode === "bounded";
    const occupied = [
      ...trackerFindingRows(tracker).map((row) => row.id),
      ...history.flatMap((report) => report.envelope.findings.map((finding) => finding.id)),
      ...(bounded ? trackerFindingHistory(tracker).map((finding) => finding.id) : []),
    ];
    console.log(JSON.stringify({ ids: allocateFindingIds(prefix, occupied, selection.count ?? 1) }, null, 2));
    return;
  }
  const result = await recordFindings(selection, manifest);
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
