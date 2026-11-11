import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { inspectExecutionReceipts, validateExecutionReceiptBatch } from "./execution-receipts.mjs";
import { validateManifest } from "./manifest.mjs";
import { projectRootFromManifest, validateProjectFiles, validateScopeCurrency } from "./project-files.mjs";
import { validateExecutionEvidenceSchema, validateRelativePath } from "./schemas.mjs";
import { parseApprovalsMarkdown } from "./tracker.mjs";
import { portablePath, readJson, sha256, writeJsonAtomic } from "./state-files.mjs";

const ACTIONS = new Set(["create", "modify", "delete", "reorder"]);

function writeError(message, code = "ERR_WRITE_GATE") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function details(errors) {
  return errors.map((error) => `${error.instancePath || "/"} ${error.message}`).join("; ");
}

async function validProject(manifestPath, { currentScope = true } = {}) {
  const manifest = await readJson(manifestPath);
  if (!validateManifest(manifest).valid) throw writeError("a valid v3.1 manifest is required", "ERR_VALIDATION");
  const files = await validateProjectFiles(manifest, manifestPath);
  const scope = currentScope ? await validateScopeCurrency(manifest, manifestPath) : { valid: true, errors: [] };
  if (!files.valid || !scope.valid) throw writeError(details([...files.errors, ...scope.errors]), "ERR_VALIDATION");
  const inspection = await inspectExecutionReceipts(manifest, manifestPath);
  if (!inspection.valid) throw writeError(details(inspection.errors), "ERR_VALIDATION");
  const projectRoot = projectRootFromManifest(manifestPath);
  const tracker = await readFile(path.resolve(projectRoot, manifest.paths.audit_tracker), "utf8");
  const approvals = parseApprovalsMarkdown(tracker);
  if (!approvals.valid) throw writeError("the approval tracker is invalid", "ERR_VALIDATION");
  const index = await readJson(path.resolve(projectRoot, manifest.paths.backups, "index.json"));
  const startedApprovals = new Set([...index.backups, ...(index.pending_backups ?? [])].map((backup) => backup.approval_id));
  return { manifest, projectRoot, inspection, approvals: approvals.approvals, startedApprovals };
}

function requireApproval(project, selection, gate = false) {
  const approval = project.approvals.find((candidate) => candidate.id === selection.approvalId);
  if (!approval || approval.type !== "edit" || approval.status !== "approved") {
    throw writeError(`a current approved edit approval is required: ${selection.approvalId}`);
  }
  if (approval.operation !== selection.operation || approval.scopeId !== selection.scopeId) {
    throw writeError("the approval operation and scope must match the requested batch");
  }
  if (JSON.stringify([...approval.paths].sort()) !== JSON.stringify(selection.files.map((file) => file.path).sort())) {
    throw writeError("the approval paths must exactly match the requested batch");
  }
  const unverified = project.inspection.summary.unverified.filter((candidate) =>
    candidate.approval_id !== selection.approvalId || project.startedApprovals.has(selection.approvalId),
  );
  if (gate && unverified.length > 0) {
    throw writeError(`write gate closed: ${unverified.length} unverified approvals remain; record or reconcile their execution evidence first`);
  }
  return approval;
}

function validateBatchFiles(files) {
  const paths = new Set();
  for (const file of files) {
    if (!file || !ACTIONS.has(file.action) || !validateRelativePath(file.path).valid || Object.keys(file).sort().join(",") !== "action,input_sha256,path") {
      throw writeError("every batch file requires only a portable path, valid action, and input hash", "ERR_ARGUMENT");
    }
    if (paths.has(file.path)) throw writeError(`duplicate batch path: ${file.path}`, "ERR_ARGUMENT");
    paths.add(file.path);
    if ((file.action === "create") !== (file.input_sha256 === null)) {
      throw writeError(`input hash does not match the file action: ${file.path}`, "ERR_ARGUMENT");
    }
    if (file.input_sha256 !== null && !/^[0-9a-f]{64}$/.test(file.input_sha256)) {
      throw writeError(`invalid input hash: ${file.path}`, "ERR_ARGUMENT");
    }
  }
}

function backupId(selection) {
  const timestamp = selection.recordedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const id = selection.backupId ?? `${timestamp}-${selection.operation}-${selection.approvalId.toLowerCase()}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw writeError("backup ID has an invalid format", "ERR_ARGUMENT");
  return id;
}

export async function recordBackup(manifestPath, selection) {
  const project = await validProject(manifestPath);
  validateBatchFiles(selection.files);
  const approval = requireApproval(project, selection, true);
  const id = backupId(selection);
  const backupRoot = path.resolve(project.projectRoot, project.manifest.paths.backups);
  const indexPath = path.join(backupRoot, "index.json");
  const index = await readJson(indexPath);
  if ([...index.backups, ...(index.pending_backups ?? [])].some((record) => record.backup_id === id)) throw writeError(`backup ID already exists: ${id}`);
  const inputHashes = {};
  const records = [];
  for (const file of selection.files) {
    const source = path.resolve(project.projectRoot, file.path);
    if (file.action === "create") {
      try {
        await stat(source);
        throw writeError(`create target is not absent: ${file.path}`);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      inputHashes[file.path] = null;
      records.push({ source_path: file.path, backup_path: null });
      continue;
    }
    const contents = await readFile(source).catch(() => {
      throw writeError(`existing target is unreadable: ${file.path}`);
    });
    if (sha256(contents) !== file.input_sha256) throw writeError(`input hash mismatch immediately before backup: ${file.path}`);
    const relativeBackup = `${project.manifest.paths.backups.replace(/\/$/, "")}/${id}/${file.path}`;
    const target = path.resolve(project.projectRoot, relativeBackup);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents, { flag: "wx" });
    if (sha256(await readFile(target)) !== file.input_sha256) throw writeError(`backup verification failed: ${file.path}`);
    inputHashes[file.path] = file.input_sha256;
    records.push({ source_path: file.path, backup_path: relativeBackup });
  }
  const manifestRelative = `${project.manifest.paths.backups.replace(/\/$/, "")}/${id}/manifest.json`;
  const backupManifest = {
    schema_version: "1.0.0",
    backup_id: id,
    operation: selection.operation,
    approval_id: selection.approvalId,
    scope_id: selection.scopeId,
    approval_summary: approval.reason,
    input_hashes: inputHashes,
    files: records,
    recorded_at: selection.recordedAt,
  };
  await mkdir(path.dirname(path.resolve(project.projectRoot, manifestRelative)), { recursive: true });
  await writeJsonAtomic(path.resolve(project.projectRoot, manifestRelative), backupManifest);
  index.pending_backups ??= [];
  index.pending_backups.push({ ...backupManifest, manifest_path: manifestRelative });
  await writeJsonAtomic(indexPath, index);
  return { backup_id: id, manifest_path: manifestRelative, files: selection.files };
}

export async function readExecutionEvidence(projectRoot, evidencePath) {
  const relative = portablePath(projectRoot, evidencePath);
  if (!validateRelativePath(relative).valid) throw writeError("evidence must be inside the project root");
  const contents = await readFile(path.resolve(projectRoot, relative));
  const evidence = JSON.parse(contents.toString("utf8"));
  const validation = validateExecutionEvidenceSchema(evidence);
  if (!validation.valid) throw writeError(details(validation.errors), "ERR_VALIDATION");
  return { evidence, source: { path: relative, sha256: sha256(contents) } };
}

function receiptFromEvidence({ evidence, source }, recordedAt) {
  return {
    schema_version: "1.0.0",
    approval_id: evidence.approval_id,
    operation: evidence.operation,
    scope_id: evidence.scope_id,
    backup_ids: evidence.backup_ids,
    files: evidence.files,
    evidence: source,
    recorded_at: recordedAt,
  };
}

async function validateNewReceipt(project, index, receipt) {
  const validation = validateExecutionReceiptBatch({ ...index, executions: [...(index.executions ?? []), receipt] }, project.approvals);
  if (!validation.valid) throw writeError(details(validation.errors), "ERR_VALIDATION");
}

export async function recordExecution(manifestPath, selection) {
  const project = await validProject(manifestPath, { currentScope: false });
  const loaded = await readExecutionEvidence(project.projectRoot, selection.evidence);
  const receipt = receiptFromEvidence(loaded, selection.recordedAt);
  requireApproval(project, { ...selection, approvalId: receipt.approval_id, operation: receipt.operation, scopeId: receipt.scope_id, files: receipt.files });
  const indexPath = path.resolve(project.projectRoot, project.manifest.paths.backups, "index.json");
  const index = await readJson(indexPath);
  await validateNewReceipt(project, index, receipt);
  index.executions = [...(index.executions ?? []), receipt];
  const completed = (index.pending_backups ?? []).filter((pending) => pending.approval_id === receipt.approval_id && pending.files.some((file) => file.backup_path !== null));
  index.backups.push(...completed);
  index.pending_backups = (index.pending_backups ?? []).filter((pending) => pending.approval_id !== receipt.approval_id);
  await writeJsonAtomic(indexPath, index);
  const after = await inspectExecutionReceipts(project.manifest, manifestPath);
  return { receipt, unverified_count: after.summary.unverified_count };
}

export async function reconcileExecutions(manifestPath, selection) {
  const project = await validProject(manifestPath, { currentScope: false });
  const indexPath = path.resolve(project.projectRoot, project.manifest.paths.backups, "index.json");
  const index = await readJson(indexPath);
  const candidates = [];
  const rejected = [];
  const alreadyRecorded = [];
  for (const evidencePath of selection.evidence) {
    try {
      const loaded = await readExecutionEvidence(project.projectRoot, path.resolve(project.projectRoot, evidencePath));
      const receipt = receiptFromEvidence(loaded, selection.recordedAt);
      const existing = (index.executions ?? []).find((candidate) => candidate.approval_id === receipt.approval_id);
      if (existing) {
        if (!existing.evidence || existing.evidence.path !== receipt.evidence.path || existing.evidence.sha256 !== receipt.evidence.sha256) {
          throw writeError(`a different receipt already exists for ${receipt.approval_id}`);
        }
        alreadyRecorded.push(receipt.approval_id);
        continue;
      }
      if (!project.inspection.summary.unverified.some((approval) => approval.approval_id === receipt.approval_id)) {
        throw writeError(`approval is not an unverified approved edit: ${receipt.approval_id}`);
      }
      await validateNewReceipt(project, { ...index, executions: [...(index.executions ?? []), ...candidates] }, receipt);
      candidates.push(receipt);
    } catch (error) {
      rejected.push({ path: evidencePath, reason: error.message });
    }
  }
  if (selection.write && candidates.length > 0) {
    index.executions = [...(index.executions ?? []), ...candidates];
    const completedIds = new Set(candidates.map((receipt) => receipt.approval_id));
    const completed = (index.pending_backups ?? []).filter((pending) => completedIds.has(pending.approval_id) && pending.files.some((file) => file.backup_path !== null));
    index.backups.push(...completed);
    index.pending_backups = (index.pending_backups ?? []).filter((pending) => !candidates.some((receipt) => receipt.approval_id === pending.approval_id));
    await writeJsonAtomic(indexPath, index);
  }
  return {
    dry_run: !selection.write,
    reconciled: candidates.map((receipt) => receipt.approval_id),
    already_recorded: alreadyRecorded,
    rejected,
    unverified_count: project.inspection.summary.unverified_count - candidates.length,
  };
}
