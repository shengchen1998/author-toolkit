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
