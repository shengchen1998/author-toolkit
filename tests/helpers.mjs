import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

export async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

export function exampleRoot(language = "en") {
  return path.join(root, `examples/fiction-revision-${language}`);
}

export function manifestPath(language = "en") {
  return path.join(exampleRoot(language), ".author-toolkit", "project.json");
}

export async function readManifest(language = "en") {
  return readJson(`examples/fiction-revision-${language}/.author-toolkit/project.json`);
}

export async function readTracker(language = "en") {
  return readFile(path.join(exampleRoot(language), "audit-tracker.md"), "utf8");
}

export async function readReport(language = "en") {
  return readFile(
    path.join(
      root,
      `examples/fiction-revision-${language}/reports/structure/2026-01-17_structure.md`,
    ),
    "utf8",
  );
}

export function clone(value) {
  return structuredClone(value);
}
