#!/usr/bin/env node

import path from "node:path";

import { inspectProjectManifest, projectRootFromManifest } from "./lib/index.mjs";
import { readPendingArtifactIndex } from "./lib/pending-artifacts.mjs";

function concise(value, limit = 240) {
  const characters = [...String(value).replace(/\s+/g, " ").trim()];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

function usage() {
  console.log(`Usage:
  node scripts/read.mjs --project-root DIR
  node scripts/read.mjs --manifest FILE

Return validated project registration, resolved paths, current scope, and a
bounded pending-action projection. Artifact counts include the pending artifact
index without returning its complete list. This command writes nothing.`);
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--project-root" && args[index + 1]) {
      result.projectRoot = path.resolve(args[++index]);
    } else if (args[index] === "--manifest" && args[index + 1]) {
      result.manifest = path.resolve(args[++index]);
    } else {
      const error = new Error(`Unknown or incomplete argument: ${args[index]}`);
      error.code = "ERR_ARGUMENT";
      throw error;
    }
  }
  if (Boolean(result.projectRoot) === Boolean(result.manifest)) {
    const error = new Error("provide exactly one of --project-root DIR or --manifest FILE");
    error.code = "ERR_ARGUMENT";
    throw error;
  }
  return result;
}

async function projection(manifest, projectRoot) {
  const pending = manifest.pending_action;
  let artifactCount = pending?.artifacts?.length ?? 0;
  if (pending?.artifact_index) {
    const index = await readPendingArtifactIndex(projectRoot);
    artifactCount = index.artifacts.length;
  }
  return {
    schema_version: manifest.schema_version,
    project_type: manifest.project_type,
    language: manifest.language,
    manuscript_root: manifest.manuscript_root,
    paths: manifest.paths,
    current_scope: manifest.current_scope
      ? {
          ...manifest.current_scope,
          description: concise(manifest.current_scope.description),
          files: manifest.current_scope.files.map((file) => ({ ...file, path: concise(file.path) })),
          excluded_files: manifest.current_scope.excluded_files.map(concise),
        }
      : null,
    pending_action: pending
      ? {
          operation: pending.operation,
          status: pending.status,
          scope_id: pending.scope_id ?? null,
          reason: concise(pending.reason),
          artifacts: (pending.artifacts ?? []).slice(0, 2).map(concise),
          artifact_count: artifactCount,
          artifact_index: pending.artifact_index ?? null,
          updated_at: pending.updated_at,
        }
      : null,
    created_at: manifest.created_at,
    updated_at: manifest.updated_at,
  };
}

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    usage();
  } else {
    const selection = options(args);
    const manifestPath = selection.manifest ?? path.join(selection.projectRoot, ".author-toolkit", "project.json");
    const projectRoot = selection.projectRoot ?? projectRootFromManifest(manifestPath);
    const result = await inspectProjectManifest(manifestPath);
    if (!result.valid) {
      console.error(JSON.stringify({ valid: false, checks: result.checks }, null, 2));
      process.exitCode = 1;
    } else {
      const projected = await projection(result.manifest, projectRoot);
      projected.valid = true;
      console.log(JSON.stringify(projected, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ valid: false, error: concise(error.message, 500) }));
  if (error.code === "ERR_ARGUMENT") usage();
  process.exitCode = error.code === "ERR_ARGUMENT" ? 2 : 1;
}
