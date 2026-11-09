#!/usr/bin/env node

import path from "node:path";

import { generateProjectDigest } from "./lib/digest.mjs";

function parseArguments(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return { help: true };
  if (args.length !== 2 || args[0] !== "--project-root" || !args[1]) {
    throw new Error("Usage: node scripts/project-digest.mjs --project-root <root>");
  }
  return { projectRoot: path.resolve(args[1]) };
}

try {
  const selection = parseArguments(process.argv.slice(2));
  if (selection.help) {
    console.log("Usage: node scripts/project-digest.mjs --project-root <root>");
  } else {
    const result = await generateProjectDigest(selection.projectRoot);
    console.log(path.basename(result.path));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
