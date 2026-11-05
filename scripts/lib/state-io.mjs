import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function createNoClobberVerified(file, contents) {
  const temporary = await writeTemporarySibling(file, contents);
  try {
    await link(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
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
