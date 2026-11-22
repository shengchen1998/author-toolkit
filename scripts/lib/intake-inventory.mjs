import { readFile } from "node:fs/promises";

import { collectManuscriptInventory } from "./manuscript.mjs";
import { sha256 } from "./state-files.mjs";

export async function readIntakeInventory({ projectRoot, manifest }) {
  const inventory = await collectManuscriptInventory(
    projectRoot,
    manifest.manuscript_root,
    manifest.paths,
  );
  const files = [];
  for (const entry of inventory.files) {
    let contents;
    try {
      contents = await readFile(entry.absolute);
    } catch (error) {
      throw new Error(`cannot read manuscript ${entry.path}: ${error.message}`);
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(contents);
    } catch {
      throw new Error(`manuscript is not valid UTF-8: ${entry.path}`);
    }
    files.push({
      path: entry.path,
      characters: [...text].length,
      sha256: sha256(contents),
    });
  }
  return { files, excluded_files: inventory.excludedFiles };
}
