import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const TERMINAL_COMMIT_STATUSES = new Set(["committed", "restored"]);
const TERMINAL_STAGING_STATUSES = new Set(["committed", "rejected", "restored"]);

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function entries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function action(strategy, operation) {
  return { strategy, operation, command: strategy };
}

function emptyRecovery(pendingAction = null) {
  return {
    recovery_required: false,
    pending_decision_required: Boolean(pendingAction),
    pending_action: pendingAction,
    interrupted_commits: [],
    interrupted_pending_actions: [],
    legacy_staging: [],
    blockers: [],
    required_action: null,
  };
}

export async function inspectLegacyRecovery(projectRoot, manifest) {
  const pendingAction = manifest.pending_action ?? null;
  if (
    manifest.cycle_operation ||
    pendingAction?.cycle_id ||
    await exists(path.resolve(projectRoot, manifest.paths.convergence, "active-cycle.json"))
  ) {
    return emptyRecovery(pendingAction);
  }

  const interruptedCommits = [];
  const commitBlockers = [];
  const batchesRelative = path.posix.join(manifest.paths.creation, "batches");
  const batchesAbsolute = path.resolve(projectRoot, batchesRelative);
  for (const entry of await entries(batchesAbsolute)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const commit = await readJson(path.join(batchesAbsolute, entry.name));
    if (!commit?.commit_id || TERMINAL_COMMIT_STATUSES.has(commit.status)) continue;
    const relative = path.posix.join(batchesRelative, entry.name);
    const record = {
      commit_id: commit.commit_id,
      batch_id: commit.batch_id ?? null,
      status: commit.status ?? "unknown",
      path: relative,
    };
    interruptedCommits.push(record);
    commitBlockers.push({
      code: "legacy-commit-recovery-required",
      message: "The legacy commit journal requires the explicit creation recovery procedure before dependent cycle work; migration did not resume, publish, or restore it.",
      ...record,
      required_action: action("write-fiction", "creation-commit"),
    });
  }

  const interruptedPendingActions = [];
  const pendingBlockers = [];
  if (pendingAction?.status === "in_progress") {
    const record = {
      operation: pendingAction.operation,
      reason: pendingAction.reason,
      artifacts: [...(pendingAction.artifacts ?? [])],
    };
    interruptedPendingActions.push(record);
    pendingBlockers.push({
      code: "legacy-pending-recovery-required",
      message: "The legacy in-progress pending action must be reconciled before dependent cycle work; it supplies no write, publication, restore, or completion approval.",
      ...record,
      required_action: action(
        pendingAction.operation.startsWith("creation") || pendingAction.operation === "chapter-review"
          ? "write-fiction"
          : "revise-draft",
        pendingAction.operation,
      ),
    });
  }

  const legacyStaging = [];
  const stagingBlockers = [];
  const stagingRelative = path.posix.join(manifest.paths.creation, "staging");
  const stagingAbsolute = path.resolve(projectRoot, stagingRelative);
  for (const entry of await entries(stagingAbsolute)) {
    if (!entry.isDirectory()) continue;
    const batch = await readJson(path.join(batchesAbsolute, `${entry.name}.json`));
    if (TERMINAL_STAGING_STATUSES.has(batch?.status)) continue;
    const record = {
      batch_id: entry.name,
      status: batch?.status ?? "unknown",
      path: path.posix.join(stagingRelative, entry.name),
    };
    legacyStaging.push(record);
    stagingBlockers.push({
      code: "legacy-staging-decision-required",
      message: "Legacy staging requires explicit rejection, or exact reapproval into a new cycle only after a current satisfied starting evaluation exists; migration did not approve or publish it.",
      ...record,
      required_action: action("write-fiction", "chapter-review"),
    });
  }

  const blockers = [...commitBlockers, ...pendingBlockers, ...stagingBlockers];
  return {
    recovery_required: blockers.length > 0,
    pending_decision_required: Boolean(pendingAction),
    pending_action: pendingAction,
    interrupted_commits: interruptedCommits,
    interrupted_pending_actions: interruptedPendingActions,
    legacy_staging: legacyStaging,
    blockers,
    required_action: blockers[0]?.required_action ?? null,
  };
}
