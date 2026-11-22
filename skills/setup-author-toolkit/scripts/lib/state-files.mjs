import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";

export { writeJsonAtomic } from "./atomic-json.mjs";

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function portablePath(projectRoot, target) {
  return path.relative(projectRoot, path.resolve(target)).replaceAll(path.sep, "/");
}

export function resolveProjectInput(projectRoot, value) {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
