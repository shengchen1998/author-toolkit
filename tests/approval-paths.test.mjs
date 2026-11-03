import assert from "node:assert/strict";
import test from "node:test";

import {
  formatApprovalPaths,
  parseApprovalPaths,
} from "../scripts/lib/approval-paths.mjs";
import { validateApprovalsMarkdown } from "../scripts/lib/index.mjs";

function tableCell(value) {
  return value.replace(/\|/g, "\\|");
}

test("approval paths round-trip commas, pipes, and backticks through the tracker", () => {
  const paths = ["manuscript/a,b.md", "manuscript/a|b.md", "manuscript/a`b.md"];
  const serialized = tableCell(formatApprovalPaths(paths));
  const parsed = parseApprovalPaths(serialized);

  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.paths, paths);

  const markdown = `## Approvals

| Approval ID | Type | Operation | Scope ID | Paths | Status | Reason | Updated |
|---|---|---|---|---|---|---|---|
| EDIT-001 | edit | chapter-revision | scope-1 | ${serialized} | approved | Exact special-character paths. | 2026-11-03T00:00:00Z |
`;
  const result = validateApprovalsMarkdown(markdown);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("approval path parsing rejects an unclosed code span", () => {
  const result = parseApprovalPaths("`manuscript/unclosed.md");
  assert.equal(result.valid, false);
});
