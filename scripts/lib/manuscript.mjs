import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const MANUSCRIPT_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);
const ALWAYS_OPERATIONAL = [".author-toolkit", "draft-baseline.md"];

function portablePath(value) {
  return value.split(path.sep).join("/");
}

function operationalRoots(paths) {
  return [
    ...ALWAYS_OPERATIONAL,
    ...Object.values(paths).filter((value) => typeof value === "string"),
  ]
    .map((value) => value.replace(/\/$/, ""))
    .filter(Boolean);
}

function isOperational(relativePath, roots) {
  return roots.some(
    (root) =>
      root === "." || relativePath === root || relativePath.startsWith(`${root}/`),
  );
}

export function isOperationalManuscriptPath(relativePath, paths = {}) {
  return isOperational(relativePath, operationalRoots(paths));
}

export async function collectManuscriptInventory(projectRoot, manuscriptRoot, paths = {}) {
  const absoluteRoot = path.resolve(projectRoot, manuscriptRoot);
  const roots = operationalRoots(paths);
  const entries = [];

  async function add(absolute, file) {
    const relativePath = portablePath(path.relative(projectRoot, absolute));
    entries.push({
      absolute,
      path: relativePath,
      extension: path.extname(relativePath).toLowerCase(),
      file,
      operational: isOperational(relativePath, roots),
    });
  }

  async function visit(directory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of children) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else await add(absolute, entry.isFile());
    }
  }

  const rootStat = await stat(absoluteRoot);
  if (rootStat.isFile()) await add(absoluteRoot, true);
  else await visit(absoluteRoot);

  return {
    files: entries.filter(
      (entry) =>
        entry.file && !entry.operational && MANUSCRIPT_EXTENSIONS.has(entry.extension),
    ),
    excludedFiles: entries
      .filter(
        (entry) =>
          !entry.file || entry.operational || !MANUSCRIPT_EXTENSIONS.has(entry.extension),
      )
      .map((entry) => entry.path),
  };
}
