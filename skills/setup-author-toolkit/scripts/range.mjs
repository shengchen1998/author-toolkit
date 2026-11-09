#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateRelativePath } from "./lib/schemas.mjs";

const BOM = String.fromCodePoint(0xfeff);

function argumentError(message) {
  const error = new Error(message);
  error.code = "ERR_ARGUMENT";
  return error;
}

function usage() {
  console.log(`Usage:
  node scripts/range.mjs [--project-root DIR] [--json] LOCATION

Resolve an author-supplied inline character range in one project-relative file.
LOCATION is path:line:start[-end]. Line and character positions are 1-based and
inclusive; characters count Unicode code points. Omit -end to select one character.
The path must remain inside the project root. A leading UTF-8 BOM is ignored. The
helper reads one file and writes nothing; it does not read the manifest or shared
state.`);
}

function options(args) {
  const result = { json: false, projectRoot: process.cwd(), location: null };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root") {
      if (!args[index + 1] || args[index + 1].startsWith("-")) {
        throw argumentError("--project-root requires a directory");
      }
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--json") {
      result.json = true;
    } else if (args[index].startsWith("-")) {
      throw argumentError(`unknown argument: ${args[index]}`);
    } else if (result.location === null) {
      result.location = args[index];
    } else {
      throw argumentError(`unexpected extra argument: ${args[index]}`);
    }
  }
  if (result.location === null) throw argumentError("LOCATION is required");
  return result;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw argumentError(`${label} must be a positive integer: ${value}`);
  }
  return number;
}

function parseLocation(raw) {
  const match = /^(.*):(\d+):(\d+)(?:-(\d+))?$/.exec(raw);
  if (!match) throw argumentError("LOCATION must be path:line:start[-end]");
  const [, file, lineText, startText, endText] = match;
  if (!file) throw argumentError("LOCATION path must not be empty");
  return {
    file,
    line: positiveInteger(lineText, "line"),
    start: positiveInteger(startText, "start"),
    end: positiveInteger(endText ?? startText, "end"),
  };
}

function splitLines(text) {
  const lines = text
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
    return;
  }
  const selection = options(args);
  const location = parseLocation(selection.location);
  if (location.start > location.end) {
    throw argumentError("range start must not exceed range end");
  }
  if (!validateRelativePath(location.file).valid) {
    throw argumentError(
      `LOCATION path must be a portable project-relative path: ${location.file}`,
    );
  }

  const absolute = path.resolve(selection.projectRoot, location.file);
  let text;
  try {
    text = await readFile(absolute, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${location.file}: ${error.message}`);
  }
  const content = text.startsWith(BOM) ? text.slice(1) : text;
  const lines = splitLines(content);
  if (location.line > lines.length) {
    const count = `${lines.length} line${lines.length === 1 ? "" : "s"}`;
    throw new Error(`line ${location.line} is outside ${location.file} (${count})`);
  }
  const characters = Array.from(lines[location.line - 1]);
  if (location.end > characters.length) {
    const count = `${characters.length} character${characters.length === 1 ? "" : "s"}`;
    throw new Error(
      `character range ${location.start}-${location.end} is outside line ${location.line} (${count})`,
    );
  }

  const resolved = characters.slice(location.start - 1, location.end).join("");
  const result = {
    path: location.file,
    line: location.line,
    start: location.start,
    end: location.end,
    text: resolved,
    line_length: characters.length,
  };
  if (selection.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const range = result.start === result.end ? `${result.start}` : `${result.start}-${result.end}`;
  console.log(`${result.path}:${result.line}:${range}`);
  console.log(result.text);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
