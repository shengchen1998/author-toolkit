function normalize(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

export function findingIdentity(report, finding) {
  return {
    stage: report.stage,
    audit: finding.audit,
    technique: normalize(finding.technique),
    issue: normalize(finding.issue),
  };
}

export function findingTrackerConflicts(envelope, rows) {
  const errors = [];
  for (const [index, finding] of (envelope.findings ?? []).entries()) {
    const row = rows.find((candidate) => candidate.id === finding.id);
    if (row && (row.audit !== finding.audit || row.stage !== envelope.stage)) {
      errors.push({
        instancePath: `/findings/${index}/id`,
        keyword: "finding-identity",
        message: `finding ID ${finding.id} conflicts with tracker audit or stage`,
        params: {},
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

export function sameFindingIdentity(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

export function allocateFindingIds(prefix, occupiedIds, count = 1) {
  if (!/^[A-Z][A-Z0-9]*$/.test(prefix)) throw new Error("prefix must contain uppercase letters or digits");
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");
  const occupied = [...occupiedIds]
    .map((id) => id.match(new RegExp(`^${prefix}-([0-9]+)$`))?.[1])
    .filter(Boolean)
    .map(Number);
  const first = Math.max(0, ...occupied) + 1;
  const ids = [];
  for (let offset = 0; offset < count; offset += 1) {
    ids.push(`${prefix}-${String(first + offset).padStart(3, "0")}`);
  }
  return ids;
}

export function validateFindingIdentity(envelope, relatedReports = [], trackerRows = []) {
  const errors = [];
  const seen = new Set();
  for (const [index, finding] of (envelope.findings ?? []).entries()) {
    if (!finding || typeof finding.id !== "string") continue;
    if (seen.has(finding.id)) {
      errors.push({
        instancePath: `/findings/${index}/id`,
        keyword: "finding-identity",
        message: `duplicate finding ID: ${finding.id}`,
        params: {},
      });
    }
    seen.add(finding.id);
    const identity = findingIdentity(envelope, finding);
    for (const report of relatedReports) {
      if (
        (report.findings ?? []).some(
          (candidate) =>
            candidate.id === finding.id &&
            !sameFindingIdentity(identity, findingIdentity(report, candidate)),
        )
      ) {
        errors.push({
          instancePath: `/findings/${index}/id`,
          keyword: "finding-identity",
          message: `conflicting finding identity: ${finding.id} is also used by ${report.report_id}`,
          params: {},
        });
      }
    }
  }
  const conflicts = findingTrackerConflicts(envelope, trackerRows).errors;
  return { valid: errors.length + conflicts.length === 0, errors: [...errors, ...conflicts] };
}
