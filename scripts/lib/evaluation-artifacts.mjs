import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { validateManifest } from "./manifest.mjs";
import { validateConvergenceCycleSchema } from "./schemas.mjs";
import { validateDeployedReferences } from "./shared-references.mjs";
import { createNoClobberVerified, sha256Bytes } from "./state-io.mjs";
import { utcTimestamp } from "./time.mjs";
import {
  samePassReference,
  validateConvergenceEvaluation,
  validateRequestedPass,
} from "./evaluation-contracts.mjs";

export async function readProject(projectRoot, options = {}) {
  const root = path.resolve(projectRoot);
  const manifestPath = path.join(root, ".author-toolkit", "project.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const validation = validateManifest(manifest, options);
  if (!validation.valid) {
    const error = new Error(`Project validation failed: ${validation.errors.map((error) => error.message).join("; ")}`);
    error.projectCode = validation.errors.find((candidate) =>
      candidate.code === "greenfield-initialization-required"
    )?.code ?? "project-state-invalid";
    error.projectDetails = { validation_errors: validation.errors };
    throw error;
  }
  const references = await validateDeployedReferences(root);
  if (!references.valid) {
    const error = new Error("Shared references are missing or do not match the installed payload; run setup-author-toolkit.");
    error.projectCode = "reference-version-conflict";
    error.projectDetails = { reference_errors: references.errors };
    throw error;
  }
  return { root, manifestPath, manifest, references };
}

export async function readActiveCycle(project, options = {}) {
  const file = path.resolve(project.root, project.manifest.paths.convergence, "active-cycle.json");
  let value;
  let text;
  try {
    text = await readFile(file, "utf8");
    value = JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const validation = validateConvergenceCycleSchema(value, options);
  if (!validation.valid || value.status !== "active") {
    throw new Error(`Living cycle is invalid: ${file}: ${formatErrors(validation.errors)}`);
  }
  return { value, file, text };
}

export function operationTime(options = {}) {
  return utcTimestamp(options);
}

export function evaluationReference(evaluation, relativePath, text) {
  return {
    evaluation_id: evaluation.evaluation_id,
    path: relativePath,
    sha256: sha256Bytes(text),
  };
}

export async function publishImmutable(file, text) {
  try {
    await createNoClobberVerified(file, text);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(file, "utf8");
    if (existing !== text) throw new Error(`Immutable artifact already differs: ${file}`);
  }
}

export function formatErrors(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

export async function completedCycles(project, options = {}) {
  const directory = path.resolve(project.root, project.manifest.paths.convergence, "cycles");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const cycles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const value = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
    const validation = validateConvergenceCycleSchema(value, options);
    if (!validation.valid) {
      throw new Error(`Completed cycle is invalid: ${entry.name}: ${formatErrors(validation.errors)}`);
    }
    if (value.status === "completed") cycles.push(value);
  }
  return cycles.sort((left, right) =>
    String(left.completion?.completed_at ?? left.updated_at).localeCompare(
      String(right.completion?.completed_at ?? right.updated_at),
    ) || left.cycle_id.localeCompare(right.cycle_id)
  );
}

export async function readEvaluationReference(project, reference, options = {}) {
  const text = await readFile(path.resolve(project.root, reference.path), "utf8");
  if (sha256Bytes(text) !== reference.sha256) {
    throw new Error(`Evaluation content hash changed: ${reference.path}`);
  }
  const value = JSON.parse(text);
  const validation = validateConvergenceEvaluation(value, options);
  if (!validation.valid) throw new Error(formatErrors(validation.errors));
  if (value.evaluation_id !== reference.evaluation_id) {
    throw new Error(`Evaluation identity changed: ${reference.path}`);
  }
  return { value, text };
}

export async function evaluationSources(project, options = {}) {
  const sources = (await completedCycles(project, options)).map((cycle) => ({
    cycle,
    evaluationReference: cycle.target_evaluation,
    passReference: cycle.requested_pass,
    sortAt: cycle.completion?.completed_at ?? cycle.updated_at,
  }));
  const directory = path.resolve(project.root, project.manifest.paths.convergence, "evaluations");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return sources;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const relative = path.posix.join(
      project.manifest.paths.convergence,
      "evaluations",
      entry.name,
    );
    const text = await readFile(path.resolve(project.root, relative), "utf8");
    const evaluationReference = {
      evaluation_id: entry.name.slice(0, -".json".length),
      path: relative,
      sha256: sha256Bytes(text),
    };
    const { value: evaluation } = await readEvaluationReference(project, evaluationReference, options);
    if (evaluation.cycle_id !== null) continue;
    sources.push({
      cycle: null,
      evaluationReference,
      passReference: evaluation.requested_pass,
      sortAt: evaluation.created_at,
    });
  }
  return sources.sort((left, right) =>
    left.sortAt.localeCompare(right.sortAt) ||
    left.evaluationReference.path.localeCompare(right.evaluationReference.path)
  );
}

export async function latestSatisfiedPass(project, excludeCycleId = null, excludeEvaluationId = null, options = {}) {
  for (const source of (await evaluationSources(project, options)).reverse()) {
    if (
      source.cycle?.cycle_id === excludeCycleId ||
      source.evaluationReference.evaluation_id === excludeEvaluationId ||
      !source.passReference
    ) continue;
    try {
      const { value: evaluation } = await readEvaluationReference(project, source.evaluationReference, options);
      if (evaluation.outcome !== "satisfied") continue;
      const passText = await readFile(path.resolve(project.root, source.passReference.path), "utf8");
      if (sha256Bytes(passText) !== source.passReference.sha256) continue;
      const pass = JSON.parse(passText);
      if (!validateRequestedPass(pass, options).valid || pass.narrowing !== null) continue;
      if (
        pass.pass_id !== source.passReference.pass_id ||
        pass.pass_fingerprint !== source.passReference.pass_fingerprint
      ) continue;
      return {
        cycle: source.cycle,
        evaluation,
        evaluationReference: source.evaluationReference,
        pass,
        passReference: source.passReference,
      };
    } catch {
      continue;
    }
  }
  return null;
}
