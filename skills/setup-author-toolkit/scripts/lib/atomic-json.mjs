import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJsonAtomic(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    if (await readFile(temporary, "utf8") !== text) {
      throw new Error("temporary JSON verification failed");
    }
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
