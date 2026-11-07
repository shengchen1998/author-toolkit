#!/usr/bin/env node

import { builtinModules } from "node:module";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "skills", "setup-author-toolkit", "scripts");
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length > 3 || (process.argv.length === 3 && !checkOnly)) {
  console.error("Usage: node scripts/sync-setup-runtime.mjs [--check]");
  process.exitCode = 2;
} else {
  await main();
}

async function main() {
  const outputRoot = path.join(root, ".test-output");
  await mkdir(outputRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(outputRoot, "setup-runtime-"));
  const generated = path.join(temporaryRoot, "scripts");

  try {
    const source = path.join(root, "scripts");
    const synchronizer = path.join(source, "sync-setup-runtime.mjs");
    await cp(source, generated, {
      recursive: true,
      filter: (file) => file !== synchronizer,
    });

    const result = await build({
      entryPoints: [path.join(source, "lib", "schemas.mjs")],
      outfile: path.join(generated, "lib", "schemas.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      legalComments: "eof",
      metafile: true,
      logLevel: "silent",
    });
    assertOnlyNodeBuiltinsAreExternal(result.metafile);
    await copyLicenses(generated);

    if (checkOnly) {
      const differences = await compareDirectories(destination, generated);
      if (differences.length > 0) {
        console.error("Setup runtime mirror is stale:");
        for (const difference of differences) console.error(`  ${difference}`);
        console.error("Run npm run sync:setup-runtime.");
        process.exitCode = 1;
      } else {
        console.log("Setup runtime mirror is current.");
      }
    } else {
      await rm(destination, { recursive: true, force: true });
      await rename(generated, destination);
      console.log(`Wrote ${path.relative(root, destination)}.`);
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function assertOnlyNodeBuiltinsAreExternal(metafile) {
  const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
  const external = Object.values(metafile.outputs).flatMap((output) =>
    output.imports.filter((entry) => entry.external && !builtins.has(entry.path)),
  );
  if (external.length > 0) {
    throw new Error(
      `Setup runtime has external packages: ${external.map((entry) => entry.path).join(", ")}`,
    );
  }
}

async function copyLicenses(generated) {
  const licenses = {
    ajv: "LICENSE",
    "ajv-formats": "LICENSE",
    "fast-deep-equal": "LICENSE",
    "fast-uri": "LICENSE",
    "json-schema-traverse": "LICENSE",
    "require-from-string": "license",
  };
  const directory = path.join(generated, "licenses");
  await mkdir(directory, { recursive: true });
  await Promise.all(
    Object.entries(licenses).map(async ([packageName, license]) => {
      const text = await readFile(path.join(root, "node_modules", packageName, license), "utf8");
      await writeFile(path.join(directory, `${packageName}.txt`), `${text.trimEnd()}\n`);
    }),
  );
}

async function compareDirectories(actual, expected) {
  const [actualFiles, expectedFiles] = await Promise.all([filesUnder(actual), filesUnder(expected)]);
  const differences = [];
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  for (const file of actualFiles) {
    if (!expectedSet.has(file)) differences.push(`unexpected ${file}`);
  }
  for (const file of expectedFiles) {
    if (!actualSet.has(file)) {
      differences.push(`missing ${file}`);
      continue;
    }
    const [actualContent, expectedContent] = await Promise.all([
      readFile(path.join(actual, file)),
      readFile(path.join(expected, file)),
    ]);
    if (!actualContent.equals(expectedContent)) differences.push(`changed ${file}`);
  }
  return differences.sort();
}

async function filesUnder(directory, prefix = "") {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return filesUnder(path.join(directory, entry.name), `${relative}/`);
      return entry.isFile() ? [relative] : [];
    }),
  );
  return files.flat().sort();
}
