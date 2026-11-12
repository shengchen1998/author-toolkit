import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateCreationCommit } from "./artifacts.mjs";
import { inspectExecutionReceipts, validateExecutionReceiptBatch } from "./execution-receipts.mjs";
import { validateManifest } from "./manifest.mjs";
import { projectRootFromManifest, validateProjectFiles, validateScopeCurrency } from "./project-files.mjs";
import { validateExecutionEvidenceSchema, validateRelativePath } from "./schemas.mjs";
import { parseApprovalsMarkdown } from "./tracker.mjs";
import { portablePath, readJson, sha256, writeJsonAtomic } from "./state-files.mjs";
import { injectTestFailure } from "./test-hooks.mjs";

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
  const files = await validateProjectFiles(manifest, manifestPath, { currentScope });
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

function validateBatchFiles(files, { publication = false } = {}) {
  const paths = new Set();
  for (const file of files) {
    const fields = Object.keys(file ?? {}).sort().join(",");
    const expectedFields = publication ? "action,content,input_sha256,output_sha256,path" : "action,input_sha256,path";
    if (!file || !ACTIONS.has(file.action) || !validateRelativePath(file.path).valid || fields !== expectedFields) {
      throw writeError(`every batch file requires only ${expectedFields.split(",").join(", ")}`, "ERR_ARGUMENT");
    }
    if (paths.has(file.path)) throw writeError(`duplicate batch path: ${file.path}`, "ERR_ARGUMENT");
    paths.add(file.path);
    if ((file.action === "create") !== (file.input_sha256 === null)) {
      throw writeError(`input hash does not match the file action: ${file.path}`, "ERR_ARGUMENT");
    }
    if (file.input_sha256 !== null && !/^[0-9a-f]{64}$/.test(file.input_sha256)) {
      throw writeError(`invalid input hash: ${file.path}`, "ERR_ARGUMENT");
    }
    if (fields.includes("output_sha256")) {
      if ((file.action === "delete") !== (file.output_sha256 === null && file.content === null)) {
        throw writeError(`output content and hash do not match the file action: ${file.path}`, "ERR_ARGUMENT");
      }
      if (file.action !== "delete" && (typeof file.content !== "string" || sha256(file.content) !== file.output_sha256)) {
        throw writeError(`output content does not match its hash: ${file.path}`, "ERR_ARGUMENT");
      }
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
  const absolute = path.isAbsolute(evidencePath) ? evidencePath : path.resolve(projectRoot, evidencePath);
  const relative = portablePath(projectRoot, absolute);
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

async function requirePublishTarget(projectRoot, file) {
  const target = path.resolve(projectRoot, file.path);
  try {
    const current = await lstat(target);
    if (file.action === "create") throw writeError(`create target is not absent: ${file.path}`);
    if (!current.isFile()) throw writeError(`publication target must be a regular file: ${file.path}`);
    if (sha256(await readFile(target)) !== file.input_sha256) throw writeError(`input hash mismatch immediately before publication: ${file.path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (file.action !== "create") throw writeError(`existing target is missing: ${file.path}`);
  }
  const root = await realpath(projectRoot);
  let ancestor = path.dirname(target);
  while (true) {
    try {
      const resolved = await realpath(ancestor);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        throw writeError(`publication parent escapes the project root: ${file.path}`);
      }
      return target;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

async function writeVerified(target, file) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    if (file.action === "delete") {
      await rm(target);
    } else {
      await writeFile(temporary, file.content, { encoding: "utf8", flag: "wx" });
      if (sha256(await readFile(temporary)) !== file.output_sha256) throw writeError(`temporary output verification failed: ${file.path}`);
      await rename(temporary, target);
    }
    if (file.action === "delete") {
      const present = await lstat(target).then(() => true).catch((error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (present) throw writeError(`deleted output remains present: ${file.path}`);
    } else if (sha256(await readFile(target)) !== file.output_sha256) {
      throw writeError(`published output verification failed: ${file.path}`);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

async function regularFile(target, filePath) {
  const current = await lstat(target).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (current && !current.isFile()) throw writeError(`publication target must be a regular file: ${filePath}`);
  return current;
}

async function loadCommitJournal(project, selection, files, backupIds) {
  if (!selection.commit) return null;
  const relative = portablePath(project.projectRoot, selection.commit);
  if (!validateRelativePath(relative).valid) throw writeError("commit journal must be inside the project root");
  const journal = await readJson(path.resolve(project.projectRoot, relative));
  const validation = validateCreationCommit(journal);
  if (!validation.valid) throw writeError(details(validation.errors), "ERR_VALIDATION");
  if (selection.operation !== "creation-commit" || !["in_progress", "interrupted"].includes(journal.status)) {
    throw writeError("complete-write requires an in_progress or interrupted creation commit journal");
  }
  if ((journal.scope_before_id ?? null) !== (project.manifest.current_scope?.scope_id ?? null)) {
    throw writeError("commit journal scope_before_id does not match the current scope");
  }
  const journalByPath = new Map(journal.files.map((file) => [file.path, file]));
  if (journal.files.length !== files.length || files.some((file) => !journalByPath.has(file.path))) {
    throw writeError("commit journal paths must exactly match the publication batch");
  }
  for (const file of files) {
    const entry = journalByPath.get(file.path);
    if (!["pending", "written", "verified"].includes(entry.status) || entry.action !== file.action || entry.input_sha256 !== file.input_sha256 || entry.output_sha256 !== file.output_sha256) {
      throw writeError(`commit journal entry does not match the pending publication: ${file.path}`);
    }
    const expectedBackup = file.action === "create" ? null : backupIds.find((id) => id === entry.backup_id);
    if (entry.backup_id !== expectedBackup) throw writeError(`commit journal backup does not match the publication batch: ${file.path}`);
  }
  return { journal, path: path.resolve(project.projectRoot, relative), relative };
}

function identicalExecution(evidence, receipt) {
  const { evidence: _source, recorded_at: _recordedAt, ...identity } = receipt;
  return JSON.stringify(identity) === JSON.stringify({
    schema_version: "1.0.0",
    approval_id: evidence.approval_id,
    operation: evidence.operation,
    scope_id: evidence.scope_id,
    backup_ids: evidence.backup_ids,
    files: evidence.files,
  });
}

async function readCompletedWrite(project, selection, commit) {
  const evidenceRelative = `${project.manifest.paths.backups.replace(/\/$/, "")}/executions/${selection.approvalId}.json`;
  const evidencePath = path.resolve(project.projectRoot, evidenceRelative);
  if (!await lstat(evidencePath).then(() => true).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  })) return null;
  const saved = await readExecutionEvidence(project.projectRoot, evidencePath);
  if (saved.evidence.operation !== selection.operation || saved.evidence.scope_id !== selection.scopeId) {
    throw writeError("preserved execution evidence does not match the requested batch identity");
  }
  const expectedFiles = selection.files.map(({ path: filePath, action, input_sha256, output_sha256 }) => ({ path: filePath, action, input_sha256, output_sha256 }));
  if (JSON.stringify(saved.evidence.files) !== JSON.stringify(expectedFiles)) {
    throw writeError("preserved execution evidence does not match the requested publication batch");
  }
  for (const file of saved.evidence.files) {
    const target = path.resolve(project.projectRoot, file.path);
    const current = await regularFile(target, file);
    if (file.action === "delete") {
      if (current) throw writeError(`completed output is unexpectedly present: ${file.path}`);
    } else if (!current || sha256(await readFile(target)) !== file.output_sha256) {
      throw writeError(`completed output does not match preserved evidence: ${file.path}`);
    }
  }
  if (commit && (!["in_progress", "interrupted"].includes(commit.journal.status) || commit.journal.files.some((file) => file.status !== "verified"))) {
    throw writeError("preserved execution evidence exists but the commit journal has unverified files");
  }
  const receipt = receiptFromEvidence(saved, selection.recordedAt);
  return { saved, receipt, pending: pendingBackupsForEvidence(project, saved.evidence) };
}

function pendingBackupsForEvidence(project, evidence) {
  return (project.pendingBackups ?? []).filter((backup) => backup.approval_id === evidence.approval_id && backup.backup_id && evidence.backup_ids.includes(backup.backup_id));
}

async function updateCommitJournal(commit, selection, status) {
  if (!commit) return;
  commit.journal.status = status;
  commit.journal.updated_at = selection.recordedAt;
  await writeJsonAtomic(commit.path, commit.journal);
}

export async function completeWrite(manifestPath, selection) {
  const project = await validProject(manifestPath, { currentScope: false });
  validateBatchFiles(selection.files, { publication: true });
  requireApproval(project, selection);
  const indexPath = path.resolve(project.projectRoot, project.manifest.paths.backups, "index.json");
  const index = await readJson(indexPath);
  project.pendingBackups = index.pending_backups ?? [];
  const existing = (index.executions ?? []).find((receipt) => receipt.approval_id === selection.approvalId);
  if (existing) {
    const saved = await readExecutionEvidence(project.projectRoot, existing.evidence?.path ?? "");
    const expectedFiles = selection.files.map(({ path: filePath, action, input_sha256, output_sha256 }) => ({ path: filePath, action, input_sha256, output_sha256 }));
    if (existing.evidence?.sha256 !== saved.source.sha256 || !identicalExecution(saved.evidence, existing) || JSON.stringify(saved.evidence.files) !== JSON.stringify(expectedFiles)) {
      throw writeError("an existing execution receipt does not match the preserved publication evidence");
    }
    return { evidence_path: saved.source.path, receipt: existing, commit_journal: selection.commit ? portablePath(project.projectRoot, selection.commit) : null, unverified_count: project.inspection.summary.unverified_count, already_recorded: true };
  }
  const pending = (index.pending_backups ?? []).filter((backup) => backup.approval_id === selection.approvalId);
  const backupIds = pending.filter((backup) => backup.files.some((file) => file.backup_path !== null)).map((backup) => backup.backup_id).sort();
  const commit = await loadCommitJournal(project, selection, selection.files, backupIds);
  if (commit?.journal.status === "interrupted" && commit.journal.files.some((file) => file.status === "written")) {
    throw writeError("a written-but-unverified journal entry requires explicit reconciliation");
  }
  const resumed = await readCompletedWrite(project, selection, commit);
  const hasResumableOutput = Boolean(resumed || commit);
  const currentProject = await validProject(manifestPath, { currentScope: hasResumableOutput ? false : undefined });
  project.manifest = currentProject.manifest;
  project.inspection = currentProject.inspection;
  if (pending.length === 0) throw writeError(`a pending backup is required: ${selection.approvalId}`);
  if (resumed) pending.push(...resumed.pending);
  if (pending.filter((backup) => backup.files.some((file) => file.backup_path !== null)).length === 0 && selection.files.some((file) => file.action !== "create")) {
    throw writeError(`a pending backup is required: ${selection.approvalId}`);
  }
  const pendingFiles = pending.flatMap((backup) => backup.files.map((file) => file.source_path));
  if (JSON.stringify([...new Set(pendingFiles)].sort()) !== JSON.stringify(selection.files.map((file) => file.path).sort())) {
    throw writeError("pending backup paths must exactly match the publication batch");
  }
  const targets = [];
  requireApproval(project, selection);
  const unrelatedUnverified = project.inspection.summary.unverified.filter((approval) => approval.approval_id !== selection.approvalId);
  if (unrelatedUnverified.length > 0) throw writeError(`write gate closed: ${unrelatedUnverified.length} unrelated unverified approvals remain`);
  if (!resumed) {
    for (const file of selection.files) {
      const target = path.resolve(project.projectRoot, file.path);
      const journalEntry = commit?.journal.files.find((entry) => entry.path === file.path);
      const current = await regularFile(target, file.path);
      if (commit && (file.action === "delete" ? !current : current && sha256(await readFile(target)) === file.output_sha256)) {
        targets.push(target);
        continue;
      }
      if (journalEntry?.status === "verified") {
        throw writeError(`verified commit output does not match the journal: ${file.path}`);
      }
      if (journalEntry && journalEntry.status !== "pending") {
        throw writeError(`commit journal entry is not safely resumable: ${file.path}`);
      }
      targets.push(await requirePublishTarget(project.projectRoot, file));
    }
  }

  const evidence = {
    schema_version: "1.0.0",
    approval_id: selection.approvalId,
    operation: selection.operation,
    scope_id: selection.scopeId,
    backup_ids: backupIds,
    files: selection.files.map(({ path: filePath, action, input_sha256, output_sha256 }) => ({ path: filePath, action, input_sha256, output_sha256 })),
    completed_at: selection.recordedAt,
  };
  const evidenceValidation = validateExecutionEvidenceSchema(evidence);
  if (!evidenceValidation.valid) throw writeError(details(evidenceValidation.errors), "ERR_VALIDATION");
  const evidenceRelative = `${project.manifest.paths.backups.replace(/\/$/, "")}/executions/${selection.approvalId}.json`;
  const evidencePath = path.resolve(project.projectRoot, evidenceRelative);
  const evidenceSource = { path: evidenceRelative, sha256: sha256(`${JSON.stringify(evidence, null, 2)}\n`) };
  await validateNewReceipt(project, index, receiptFromEvidence({ evidence, source: evidenceSource }, selection.recordedAt));
  let publicationStarted = false;
  let receiptStarted = false;
  try {
    for (const [index, file] of (resumed ? [] : selection.files).entries()) {
      publicationStarted = true;
      const journalEntry = commit?.journal.files.find((entry) => entry.path === file.path);
      if (journalEntry?.status === "verified") {
        continue;
      }
      await writeVerified(targets[index], file);
      if (commit) {
        commit.journal.files.find((entry) => entry.path === file.path).status = "written";
        await updateCommitJournal(commit, selection, "in_progress");
        commit.journal.files.find((entry) => entry.path === file.path).status = "verified";
        await updateCommitJournal(commit, selection, "in_progress");
      }
    }
    await mkdir(path.dirname(evidencePath), { recursive: true });
    injectTestFailure("complete-write-evidence");
    const saved = resumed ?? await (async () => {
      await writeJsonAtomic(evidencePath, evidence);
      const loaded = await readExecutionEvidence(project.projectRoot, evidencePath);
      return { saved: loaded, receipt: receiptFromEvidence(loaded, selection.recordedAt) };
    })();
    const savedReceipt = saved.receipt;
    index.executions = [...(index.executions ?? []), savedReceipt];
    const completed = pending.filter((backup) => backup.files.some((file) => file.backup_path !== null));
    index.backups.push(...completed);
    index.pending_backups = index.pending_backups.filter((backup) => backup.approval_id !== selection.approvalId);
    receiptStarted = true;
    injectTestFailure("complete-write-index");
    await writeJsonAtomic(indexPath, index);
    if (commit?.journal.status === "interrupted") await updateCommitJournal(commit, selection, "in_progress");
    const after = await inspectExecutionReceipts(project.manifest, manifestPath);
    return {
      evidence_path: saved.saved.source.path,
      receipt: savedReceipt,
      commit_journal: commit?.relative ?? null,
      already_recorded: false,
      unverified_count: after.summary.unverified_count,
    };
  } catch (error) {
    if (publicationStarted) {
      if (commit) await updateCommitJournal(commit, selection, "interrupted");
      error.message += resumed || commit
        ? "; receipt recording is interrupted; preserve outputs and retry complete-write with the same batch"
        : "; publication is interrupted; retry the same batch only after inspecting each target and the journal";
      if (receiptStarted) error.message += "; the preserved evidence identifies the completed batch";
    }
    throw error;
  }
}
