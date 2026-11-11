export function unverifiedOperationGroups(approvals) {
  const groups = new Map();
  for (const approval of approvals) {
    if (!groups.has(approval.operation)) groups.set(approval.operation, []);
    groups.get(approval.operation).push(approval.approval_id);
  }
  return [...groups].map(([operation, approvalIds]) => ({
    operation,
    count: approvalIds.length,
    first: approvalIds[0],
    last: approvalIds.at(-1),
  }));
}

export function outputUnverifiedOperationGroups(approvals) {
  if (approvals.length === 0) return;
  console.log("Unverified by operation (first/last approval IDs):");
  const groups = unverifiedOperationGroups(approvals);
  for (const group of groups.slice(0, 8)) {
    console.log(`- ${group.operation}: ${group.count} (${group.first} … ${group.last})`);
  }
  if (groups.length > 8) {
    console.log(`- ... ${groups.length - 8} more operation groups; use --json for the complete list`);
  }
}
