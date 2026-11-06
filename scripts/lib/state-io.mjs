import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export function sha256Bytes(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function writeTemporarySibling(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`,
  );
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx" });
  if (sha256Bytes(await readFile(temporary)) !== sha256Bytes(contents)) {
    await rm(temporary, { force: true });
    throw new Error(`Temporary write verification failed: ${file}`);
  }
  return temporary;
}

export async function writeAtomicVerified(file, contents) {
  const temporary = await writeTemporarySibling(file, contents);
  try {
    await rename(temporary, file);
    if (sha256Bytes(await readFile(file)) !== sha256Bytes(contents)) {
      throw new Error(`Atomic write verification failed: ${file}`);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function createNoClobberVerified(file, contents) {
  const temporary = await writeTemporarySibling(file, contents);
  try {
    await link(temporary, file);
    if (sha256Bytes(await readFile(file)) !== sha256Bytes(contents)) {
      throw new Error(`No-clobber publication verification failed: ${file}`);
    }
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function removeVerified(file, expectedSha256) {
  const contents = await readFile(file);
  const actual = sha256Bytes(contents);
  if (actual !== expectedSha256) {
    throw new Error(`Refusing to remove ${file}: expected ${expectedSha256}, found ${actual}`);
  }
  await unlink(file);
}


export async function acquireDirectoryLock(directory, { timeoutMs = 10000, retryMs = 20 } = {}) {
  const waitTimeout = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? timeoutMs : 10000;
  const retryDelay = Number.isFinite(retryMs) && retryMs >= 1 ? retryMs : 20;
  const startedAt = Date.now();
  while (true) {
    let created = false;
    try {
      await mkdir(directory);
      created = true;
      const token = randomUUID();
      const owner = {
        pid: process.pid,
        token,
        acquired_at: new Date().toISOString(),
      };
      await writeFile(
        path.join(directory, "owner.json"),
        `${JSON.stringify(owner, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" },
      );
      return { acquired: true, directory, token };
    } catch (error) {
      if (created) {
        try {
          await rm(directory, { recursive: true, force: true });
        } catch (cleanupError) {
          return {
            acquired: false,
            code: "error",
            directory,
            error: new Error(`${error.message}; lock cleanup failed: ${cleanupError.message}`),
          };
        }
        return { acquired: false, code: "error", directory, error };
      }
      if (error.code !== "EEXIST") {
        return { acquired: false, code: "error", directory, error };
      }
      if (Date.now() - startedAt >= waitTimeout) {
        return { acquired: false, code: "timeout", directory, error };
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
}

export async function releaseDirectoryLock(lock) {
  try {
    const owner = JSON.parse(await readFile(path.join(lock.directory, "owner.json"), "utf8"));
    if (owner.pid !== process.pid || owner.token !== lock.token) {
      throw new Error(`Transition lock ownership changed: ${lock.directory}`);
    }
    await rm(lock.directory, { recursive: true, force: false });
    return { released: true, error: null };
  } catch (error) {
    return { released: false, error };
  }
}

function ownerIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "EPERM") return true;
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export async function inspectDirectoryLock(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { present: false, directory, owner: null };
    throw error;
  }
  try {
    const owner = JSON.parse(await readFile(path.join(directory, "owner.json"), "utf8"));
    if (
      !Number.isInteger(owner.pid) || owner.pid <= 0 ||
      typeof owner.token !== "string" || owner.token.length === 0 ||
      typeof owner.acquired_at !== "string"
    ) {
      throw new Error("Lock owner requires a positive PID, token, and acquisition time");
    }
    return {
      present: true,
      directory,
      owner,
      running: ownerIsRunning(owner.pid),
      entries: entries.map((entry) => entry.name).sort(),
    };
  } catch (error) {
    return {
      present: true,
      directory,
      owner: null,
      running: null,
      entries: entries.map((entry) => entry.name).sort(),
      error,
    };
  }
}

export async function releaseAbandonedDirectoryLock(directory, expectedOwner) {
  const inspected = await inspectDirectoryLock(directory);
  if (!inspected.present) return { released: false, code: "cycle-lock-not-present", inspected };
  if (!inspected.owner) {
    return { released: false, code: "cycle-lock-owner-invalid", inspected };
  }
  if (
    inspected.owner.pid !== expectedOwner?.pid ||
    inspected.owner.token !== expectedOwner?.token
  ) {
    return { released: false, code: "cycle-lock-owner-mismatch", inspected };
  }
  if (inspected.running) {
    return { released: false, code: "cycle-lock-owner-active", inspected };
  }
  if (inspected.entries.length !== 1 || inspected.entries[0] !== "owner.json") {
    return { released: false, code: "cycle-lock-contents-unexpected", inspected };
  }
  const ownerPath = path.join(directory, "owner.json");
  const confirmed = JSON.parse(await readFile(ownerPath, "utf8"));
  if (confirmed.pid !== expectedOwner.pid || confirmed.token !== expectedOwner.token) {
    return { released: false, code: "cycle-lock-owner-mismatch", inspected };
  }
  await unlink(ownerPath);
  await rmdir(directory);
  return { released: true, code: null, inspected };
}
