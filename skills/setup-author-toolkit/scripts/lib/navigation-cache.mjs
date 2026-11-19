import { readFile } from "node:fs/promises";
import path from "node:path";

import { manifestNavigationFields } from "./navigation-fields.mjs";

const generatedAtPattern = /^- Generated at: `([^`]+)`$/m;
const validationPattern = /^- Validation at generation: passed \(project validation only; not an execution gate or current-draft revision convergence claim\)\.$/m;
const freshnessPattern = /^- Freshness: generation-time snapshot only; rerun preflight before reuse\.$/m;
const executionPattern = /^- Execution evidence: \d+\/\d+ verified; \d+ unverified(?: in scope `[^`\r\n]+`| across all scopes)(?:; strict execution gate would fail)?$/m;

function cacheField(text, name) {
  return text.split("\n").find((line) => line.startsWith(`- ${name}: `)) ?? null;
}

function compareManifest(text, result, manifest) {
  const generatedTime = Date.parse(result.generated_at);
  for (const field of ["created_at", "updated_at"]) {
    const manifestTime = Date.parse(manifest[field]);
    if (Number.isFinite(manifestTime) && generatedTime < manifestTime) {
      markNavigationCacheStale(result, `cache generated before manifest ${field}`);
    }
  }
  const expected = manifestNavigationFields(manifest);
  for (const [name, field, issue] of [
    ["Scope", "scope", "cache scope differs from current manifest"],
    ["Pending action", "pendingAction", "cache pending action differs from current manifest"],
    ["Pending scope", "pendingScope", "cache pending action differs from current manifest"],
    ["Pending reason", "pendingReason", "cache pending action differs from current manifest"],
  ]) {
    if (cacheField(text, name) !== expected[field]) markNavigationCacheStale(result, issue);
  }
}

export async function inspectNavigationCache(projectRoot, manifest = null) {
  const result = {
    path: "PROJECT_STATE.md",
    present: false,
    format_valid: false,
    generated_at: null,
    state: "absent",
    reusable: false,
    next_action: "withheld",
    issues: [],
  };
  let text;
  try {
    text = await readFile(path.join(projectRoot, result.path), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return result;
    result.state = "stale";
    result.issues.push("cache is unreadable");
    return result;
  }
  result.present = true;
  result.state = "stale";
  if (!text.startsWith("# Project State\n")) result.issues.push("missing project-state heading");
  const generatedAt = text.match(generatedAtPattern)?.[1];
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    result.issues.push("missing or invalid UTC Generated at field");
  } else {
    result.generated_at = generatedAt;
  }
  if (!validationPattern.test(text)) result.issues.push("missing generation-time validation field");
  if (!freshnessPattern.test(text)) result.issues.push("missing generation-time freshness field");
  if (!executionPattern.test(text)) result.issues.push("missing or invalid execution-evidence field");
  if (!/^- Next action: .+ \(recorded; strategy gates not evaluated\)$/m.test(text) && !/^- Next action: withheld until execution evidence is reconciled; use the `revise-draft` host command \(strict execution gate would fail\)$/m.test(text)) {
    result.issues.push("missing or unsafe next-action field");
  }
  result.format_valid = result.issues.length === 0;
  if (result.format_valid) {
    result.state = "usable_snapshot";
    result.reusable = true;
    result.next_action = "recorded_unevaluated";
    if (manifest) compareManifest(text, result, manifest);
  }
  return result;
}

export function markNavigationCacheStale(cache, issue) {
  if (!cache || cache.state === "absent") return;
  cache.state = "stale";
  cache.reusable = false;
  cache.next_action = "withheld";
  if (!cache.issues.includes(issue)) cache.issues.push(issue);
}
