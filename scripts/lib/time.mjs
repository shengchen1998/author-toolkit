export function utcDate(now) {
  const value = now === undefined ? new Date() : new Date(now instanceof Date ? now.getTime() : now);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid UTC time");
  return value;
}

export function utcTimestamp(options = {}) {
  return utcDate(options.now).toISOString();
}

export function timestampResult(options = {}) {
  const json = utcTimestamp(options);
  return { json, filename: json.replace(/[-:.]/g, "") };
}

function pointerPart(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function validateEvidenceTimestamps(value, options = {}) {
  const current = utcDate(options.now);
  const currentTime = current.toISOString();
  const maximum = current.getTime() + 60_000;
  const errors = [];

  function visit(candidate, instancePath) {
    if (!candidate || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      const childPath = `${instancePath}/${pointerPart(key)}`;
      if (key.endsWith("_at") && typeof child === "string") {
        const timestamp = Date.parse(child);
        if (Number.isFinite(timestamp) && timestamp > maximum) {
          errors.push({
            instancePath: childPath,
            keyword: "future-timestamp",
            message: `timestamp must not be more than 60 seconds after the current UTC time (${currentTime})`,
            params: {
              current_time: currentTime,
              future_tolerance_seconds: 60,
            },
          });
        }
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return errors;
}
