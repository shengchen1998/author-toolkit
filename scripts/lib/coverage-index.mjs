import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateCoverageIndex } from "./artifacts.mjs";
import {
  samePassReference,
  sameReference,
  validateRequestedPass,
  validateSemanticAttestation,
} from "./evaluation-contracts.mjs";
import { validateEvidenceReport } from "./markdown.mjs";
import {
  validateCoverageUnitSchema,
  validateRelativePath,
} from "./schemas.mjs";
import { validateScopeSnapshot } from "./scope.mjs";
import { sha256Bytes } from "./state-io.mjs";

function coverageError(instancePath, message, code = "coverage-evidence-invalid") {
  return { instancePath, code, keyword: code, message, params: {} };
}

async function projectRootForIndex(indexPath) {
  let directory = path.dirname(path.resolve(indexPath));
  while (true) {
    try {
      await readFile(path.join(directory, ".author-toolkit", "project.json"), "utf8");
      return directory;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Cannot locate .author-toolkit/project.json for the coverage index");
    }
    directory = parent;
  }
}

async function readArtifact(projectRoot, reference, instancePath, errors) {
  if (!reference?.path || !validateRelativePath(reference.path).valid || !/^[0-9a-f]{64}$/.test(reference.sha256 ?? "")) {
    errors.push(coverageError(instancePath, "artifact reference requires a safe path and SHA-256", "coverage-reference-invalid"));
    return null;
  }
  try {
    const contents = await readFile(path.resolve(projectRoot, reference.path));
    if (sha256Bytes(contents) !== reference.sha256) {
      errors.push(coverageError(`${instancePath}/sha256`, `artifact hash differs for ${reference.path}`, "coverage-artifact-hash-mismatch"));
      return null;
    }
    return contents;
  } catch (error) {
    errors.push(coverageError(instancePath, `cannot read artifact ${reference.path}: ${error.message}`, "coverage-artifact-unavailable"));
    return null;
  }
}

async function readJson(projectRoot, reference, instancePath, errors) {
  const contents = await readArtifact(projectRoot, reference, instancePath, errors);
  if (!contents) return null;
  try {
    return JSON.parse(contents.toString("utf8"));
  } catch (error) {
    errors.push(coverageError(instancePath, `artifact is not valid JSON: ${error.message}`, "coverage-artifact-json-invalid"));
    return null;
  }
}

function dependencyMatches(source, current) {
  return source.path === current.path && source.sha256 === current.sha256;
}

function validateDependencySource(source, dependency, operation, contents, errors) {
  if (!source?.report_id || !contents) return false;
  const validation = validateEvidenceReport(contents.toString("utf8"));
  const report = validation.envelope;
  if (!validation.valid || report.report_id !== source.report_id || report.stage !== operation) {
    errors.push(coverageError(
      "/dependency_exception/source",
      `dependency source must be a valid ${operation} report with matching identity`,
      "dependency-source-invalid",
    ));
    return false;
  }
  if (dependencyMatches(source, dependency)) return true;
  return report.inputs.some((input) =>
    input.path === dependency.path && input.version === dependency.sha256 && input.version_type === "sha256"
  );
}

async function validateException(projectRoot, unit, pass, exception, options, errors) {
  const dependency = pass.dependencies.find((candidate) => candidate.path === exception.dependency_path);
  const oldDependency = unit.dependencies.find((candidate) => candidate.path === exception.dependency_path);
  if (
    exception.unit_id !== unit.unit_id ||
    !samePassReference(exception.requested_pass, pass.requested_pass ?? pass) ||
    !dependency ||
    !oldDependency ||
    oldDependency.sha256 !== exception.old_sha256 ||
    dependency.sha256 !== exception.new_sha256 ||
    exception.old_sha256 === exception.new_sha256 ||
    dependency.role !== exception.operation
  ) {
    errors.push(coverageError(
      "/dependency_exception",
      "dependency exception does not bind the unit, current pass, role, and exact old/new dependency versions",
      "dependency-exception-identity-mismatch",
    ));
    return;
  }
  const unitPaths = unit.dependencies.map((candidate) => candidate.path).sort();
  const passPaths = pass.dependencies.map((candidate) => candidate.path).sort();
  const changed = unitPaths.filter((filePath, index) =>
    filePath === passPaths[index] &&
    unit.dependencies.find((candidate) => candidate.path === filePath)?.sha256 !==
      pass.dependencies.find((candidate) => candidate.path === filePath)?.sha256
  );
  if (JSON.stringify(unitPaths) !== JSON.stringify(passPaths) || changed.length !== 1) {
    errors.push(coverageError(
      "/dependency_exception",
      "dependency exception must change exactly one dependency hash",
      "dependency-exception-hash-mismatch",
    ));
  }
  const sourceContents = await readArtifact(
    projectRoot,
    dependency.source,
    "/dependency_exception/source",
    errors,
  );
  if (!validateDependencySource(dependency.source, dependency, exception.operation, sourceContents, errors)) {
    errors.push(coverageError(
      "/dependency_exception/source",
      "dependency source does not prove the current dependency version",
      "dependency-source-invalid",
    ));
  }

  const attestation = await readJson(
    projectRoot,
    exception.semantic_attestation,
    "/dependency_exception/semantic_attestation",
    errors,
  );
  if (!attestation) return;
  const attestationValidation = validateSemanticAttestation(attestation, options);
  if (!attestationValidation.valid) {
    errors.push(...attestationValidation.errors.map((error) => ({
      ...error,
      code: "dependency-exception-attestation-mismatch",
    })));
    return;
  }
  const claims = attestation.claims.filter((claim) =>
    claim.claim_type === "dependency-copyedit" && claim.subject === unit.unit_id
  );
  if (attestation.attester.role !== "host" || claims.length !== 1 || claims[0].verdict !== "confirmed") {
    errors.push(coverageError(
      "/dependency_exception/semantic_attestation",
      "dependency exception requires one confirmed host dependency-copyedit claim",
      "dependency-exception-attestation-mismatch",
    ));
    return;
  }
  const artifacts = claims[0].artifacts;
  const passArtifacts = artifacts.filter((artifact) => sameReference(artifact, exception.requested_pass));
  const dependencyArtifacts = artifacts.filter((artifact) => dependencyMatches(artifact, dependency));
  const sourceArtifacts = artifacts.filter((artifact) =>
    !sameReference(artifact, exception.requested_pass) && !dependencyMatches(artifact, dependency)
  );
  if (
    attestation.attestation_id !== exception.semantic_attestation.attestation_id ||
    attestation.pass_id !== pass.pass_id ||
    attestation.pass_fingerprint !== pass.pass_fingerprint ||
    attestation.scope_id !== pass.target_scope.scope_id ||
    attestation.scope_fingerprint !== pass.target_scope.scope_fingerprint ||
    artifacts.length !== 3 ||
    passArtifacts.length !== 1 ||
    dependencyArtifacts.length !== 1 ||
    sourceArtifacts.length !== 1
  ) {
    errors.push(coverageError(
      "/dependency_exception/semantic_attestation",
      `dependency-copyedit claim must exactly attest source unit, requested pass, and current dependency (artifacts=${artifacts.length}, pass=${passArtifacts.length}, dependency=${dependencyArtifacts.length}, source=${sourceArtifacts.length})`,
      "dependency-exception-attestation-mismatch",
    ));
    return;
  }
  const sourceUnit = await readJson(projectRoot, sourceArtifacts[0], "/dependency_exception/source_unit", errors);
  if (!sourceUnit) return;
  const sourceValidation = validateCoverageUnitSchema(sourceUnit, options);
  if (!sourceValidation.valid) {
    errors.push(...sourceValidation.errors.map((error) => ({
      ...error,
      code: "dependency-exception-source-mismatch",
    })));
    return;
  }
  const sourceDependency = sourceUnit.dependencies?.find((candidate) => candidate.path === exception.dependency_path);
  if (
    sourceUnit.dependency_exception !== null ||
    sourceUnit.unit_id !== unit.unit_id ||
    sourceUnit.source_report !== unit.source_report ||
    sourceUnit.source_report_sha256 !== unit.source_report_sha256 ||
    sourceUnit.scope_id !== unit.scope_id ||
    sourceUnit.operation !== unit.operation ||
    sourceUnit.kind !== unit.kind ||
    sourceUnit.coverage !== unit.coverage ||
    JSON.stringify(sourceUnit.paths) !== JSON.stringify(unit.paths) ||
    JSON.stringify(sourceUnit.dependencies) !== JSON.stringify(unit.dependencies) ||
    JSON.stringify([...sourceUnit.subchecks].sort()) !== JSON.stringify([...unit.subchecks].sort()) ||
    sourceDependency?.sha256 !== exception.old_sha256
  ) {
    errors.push(coverageError(
      "/dependency_exception/source_unit",
      "exception source unit does not preserve the original evidence and cannot chain exceptions",
      "dependency-exception-source-mismatch",
    ));
  }
}

export async function validateCoverageIndexFile(indexPath, options = {}) {
  const errors = [];
  try {
    const projectRoot = options.projectRoot ?? await projectRootForIndex(indexPath);
    const manifest = JSON.parse(await readFile(
      path.join(projectRoot, ".author-toolkit", "project.json"),
      "utf8",
    ));
    const value = JSON.parse(await readFile(indexPath, "utf8"));
    const local = validateCoverageIndex(value, options);
    errors.push(...local.errors);
    const reportsRoot = manifest.paths.reports.replace(/\/$/, "");
    const relativeIndex = path.relative(projectRoot, path.resolve(indexPath)).split(path.sep).join("/");
    if (relativeIndex !== reportsRoot && !relativeIndex.startsWith(`${reportsRoot}/`)) {
      errors.push(coverageError("", `coverage index must be beneath registered paths.reports: ${relativeIndex}`, "coverage-index-path-mismatch"));
    }
    const currentScope = manifest.current_scope;
    if (!currentScope || currentScope.scope_id !== value.scope_id || currentScope.scope_fingerprint !== value.scope_fingerprint) {
      errors.push(coverageError(
        "/scope_fingerprint",
        "coverage index scope does not match the current confirmed scope",
        "coverage-index-scope-mismatch",
      ));
    }
    if (currentScope?.snapshot_path) {
      const scope = await readJson(projectRoot, {
        path: currentScope.snapshot_path,
        sha256: currentScope.snapshot_sha256,
      }, "/current_scope/snapshot", errors);
      if (scope) {
        const validation = validateScopeSnapshot(scope, options);
        errors.push(...validation.errors);
        if (scope.scope_id !== value.scope_id || scope.scope_fingerprint !== value.scope_fingerprint) {
          errors.push(coverageError(
            "/current_scope/snapshot",
            "coverage index scope identity differs from its immutable snapshot",
            "coverage-index-scope-mismatch",
          ));
        }
      }
    }
    const pass = await readJson(projectRoot, value.requested_pass, "/requested_pass", errors);
    if (pass) {
      const validation = validateRequestedPass(pass, options);
      errors.push(...validation.errors);
      if (
        pass.pass_id !== value.requested_pass.pass_id ||
        pass.pass_fingerprint !== value.requested_pass.pass_fingerprint
      ) {
        errors.push(coverageError(
          "/requested_pass",
          "requested-pass identity differs from the referenced artifact",
          "coverage-index-pass-mismatch",
        ));
      }
      pass.requested_pass = value.requested_pass;
    }

    for (const [entryIndex, entry] of (value.entries ?? []).entries()) {
      for (const [unitIndex, reference] of entry.units.entries()) {
        const unit = await readJson(projectRoot, reference, `/entries/${entryIndex}/units/${unitIndex}`, errors);
        if (!unit) continue;
        const validation = validateCoverageUnitSchema(unit, options);
        errors.push(...validation.errors);
        if (unit.unit_id !== reference.unit_id || unit.operation !== entry.operation) {
          errors.push(coverageError(
            `/entries/${entryIndex}/units/${unitIndex}`,
            "coverage unit identity or operation differs from the index entry",
            "coverage-unit-identity-mismatch",
          ));
        }
        if (unit.source_report && unit.source_report_sha256) {
          const reportContents = await readArtifact(projectRoot, {
            path: unit.source_report,
            sha256: unit.source_report_sha256,
          }, `/entries/${entryIndex}/units/${unitIndex}/source_report`, errors);
          if (reportContents) {
            const reportValidation = validateEvidenceReport(reportContents.toString("utf8"), options);
            errors.push(...reportValidation.errors);
            if (reportValidation.envelope?.stage !== unit.operation) {
              errors.push(coverageError(
                `/entries/${entryIndex}/units/${unitIndex}/source_report`,
                "coverage source report has the wrong operation",
                "coverage-source-operation-mismatch",
              ));
            }
          }
        }
        if (pass) {
          if (unit.dependency_exception) {
            await validateException(projectRoot, unit, pass, unit.dependency_exception, options, errors);
          } else {
            const actual = unit.dependencies.map((dependency) => `${dependency.path}\0${dependency.sha256}`).sort();
            const expected = pass.dependencies.map((dependency) => `${dependency.path}\0${dependency.sha256}`).sort();
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
              errors.push(coverageError(
                `/entries/${entryIndex}/units/${unitIndex}/dependencies`,
                "coverage unit dependencies differ from the current requested pass without an exception",
                "coverage-unit-not-current",
              ));
            }
          }
        }
      }
      if (entry.synthesis_report) {
        const contents = await readArtifact(projectRoot, {
          path: entry.synthesis_report,
          sha256: entry.synthesis_report_sha256,
        }, `/entries/${entryIndex}/synthesis_report`, errors);
        if (contents) {
          const validation = validateEvidenceReport(contents.toString("utf8"), options);
          errors.push(...validation.errors);
          if (
            validation.envelope?.stage !== entry.operation ||
            validation.envelope?.scope_id !== value.scope_id ||
            validation.envelope?.scope_fingerprint !== value.scope_fingerprint ||
            !samePassReference(validation.envelope?.requested_pass, value.requested_pass)
          ) {
            errors.push(coverageError(
              `/entries/${entryIndex}/synthesis_report`,
              "synthesis report does not match the index operation, scope, and requested pass",
              "coverage-synthesis-mismatch",
            ));
          }
        }
      }
    }
  } catch (error) {
    errors.push(coverageError("", error.message, "coverage-index-unavailable"));
  }
  return { valid: errors.length === 0, errors };
}
