import { readFile } from "node:fs/promises";
import path from "node:path";

const generatedAtPattern = /^- Generated at: `([^`]+)`$/m;
const validationPattern = /^- Validation at generation: passed \(project validation only; not an execution gate or current-draft revision convergence claim\)\.$/m;
const freshnessPattern = /^- Freshness: generation-time snapshot only; rerun preflight before reuse\.$/m;
const executionPattern = /^- Execution evidence: \d+\/\d+ verified; \d+ unverified(?: in scope `[^`\r\n]+`| across all scopes)(?:; strict execution gate would fail)?$/m;

export async function inspectNavigationCache(projectRoot) {
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
  if (!/^- Next action: .+ \(recorded; strategy gates not evaluated\)$/m.test(text) && !/^- Next action: withheld until execution evidence is reconciled; use `\$revise-draft` \(strict execution gate would fail\)$/m.test(text)) {
    result.issues.push("missing or unsafe next-action field");
  }
  result.format_valid = result.issues.length === 0;
  if (result.format_valid) {
    result.state = "usable_snapshot";
    result.reusable = true;
    result.next_action = "recorded_unevaluated";
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
