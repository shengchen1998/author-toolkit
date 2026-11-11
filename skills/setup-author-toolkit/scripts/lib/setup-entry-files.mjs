import { randomUUID } from "node:crypto";
import { lstat, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { inspectSetupPayload } from "./setup-payload.mjs";

function targetError(file, reason) {
  const error = new Error(`${file}: ${reason}; neither target is replaceable`);
  error.code = "ERR_ENTRY_TARGET";
  return error;
}

async function targetStatus(target, file, expected) {
  let stats;
  try {
    stats = await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return file === "AGENTS.md" ? "created" : "missing";
    throw error;
  }
  if (stats.isDirectory()) throw targetError(file, "is a directory");
  if (!stats.isFile() && !stats.isSymbolicLink()) {
    throw targetError(file, "is not a regular file or symbolic link");
  }
  if (file === "AGENTS.md") {
    return stats.isFile() && (await readFile(target)).equals(expected) ? "unchanged" : "replaced";
  }
  return stats.isSymbolicLink() && await readlink(target) === "AGENTS.md" ? "unchanged" : "replaced";
}

export async function installEntryFiles(setupRoot, projectRoot) {
  const payload = await inspectSetupPayload(setupRoot);
  if (!payload.valid) {
    const error = new Error("installed setup payload is incomplete; run doctor.mjs for failure paths");
    error.code = "ERR_PAYLOAD";
    throw error;
  }
  const rootStats = await lstat(projectRoot);
  if (!rootStats.isDirectory()) throw new Error("project root must be an existing directory");

  const template = await readFile(path.join(setupRoot, "assets", "AGENTS.md"));
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  const claudePath = path.join(projectRoot, "CLAUDE.md");
  const [agents, claude] = await Promise.all([
    targetStatus(agentsPath, "AGENTS.md", template),
    targetStatus(claudePath, "CLAUDE.md"),
  ]);
  const suffix = `${process.pid}.${randomUUID()}.tmp`;
  const temporaryAgents = path.join(projectRoot, `.AGENTS.md.${suffix}`);
  const temporaryClaude = path.join(projectRoot, `.CLAUDE.md.${suffix}`);
  try {
    await writeFile(temporaryAgents, template, { flag: "wx" });
    await symlink("AGENTS.md", temporaryClaude);
    if (!(await readFile(temporaryAgents)).equals(template)) {
      throw new Error("temporary AGENTS.md verification failed");
    }
    if (await readlink(temporaryClaude) !== "AGENTS.md") {
      throw new Error("temporary CLAUDE.md verification failed");
    }
    if (agents !== "unchanged") await rename(temporaryAgents, agentsPath);
    if (claude !== "unchanged") await rename(temporaryClaude, claudePath);
  } finally {
    await Promise.all([
      rm(temporaryAgents, { force: true }),
      rm(temporaryClaude, { force: true }),
    ]);
  }
  return {
    valid: true,
    project_root: projectRoot,
    agents: { path: "AGENTS.md", status: agents },
    claude: { path: "CLAUDE.md", target: "AGENTS.md", status: claude },
  };
}
