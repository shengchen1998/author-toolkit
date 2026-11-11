import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

import { projectRootFromManifest } from "./project-files.mjs";
export async function withProjectWriteLock(manifestPath, manifest, operation) {
  const backupRoot = path.resolve(projectRootFromManifest(manifestPath), manifest.paths.backups);
  await mkdir(backupRoot, { recursive: true });
  const lockPath = path.join(backupRoot, ".writes.lock");
  const lock = await open(lockPath, "wx").catch((error) => {
    if (error.code === "EEXIST") {
      const locked = new Error("another project write is active or left a lock; reconcile it before continuing");
      locked.code = "ERR_WRITE_GATE";
      throw locked;
    }
    throw error;
  });
  try {
    await lock.writeFile(`${process.pid}\n`);
    return await operation();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
