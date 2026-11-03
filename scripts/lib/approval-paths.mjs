function codeSpan(value) {
  const longestRun = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const delimiter = "`".repeat(longestRun + 1);
  const padding = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

export function formatApprovalPaths(paths) {
  return paths.map((file) => codeSpan(file)).join(", ");
}

function decodeSegment(segment) {
  const trimmed = segment.trim();
  if (!trimmed) throw new Error("empty approval path");
  if (!trimmed.startsWith("`")) return trimmed.replace(/\\\|/g, "|");

  const delimiter = trimmed.match(/^`+/)[0];
  if (!trimmed.endsWith(delimiter) || trimmed.length < delimiter.length * 2) {
    throw new Error("unclosed approval path code span");
  }
  let value = trimmed.slice(delimiter.length, -delimiter.length);
  if (delimiter.length > 1 && value.startsWith(" ") && value.endsWith(" ")) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\\|/g, "|");
}

export function parseApprovalPaths(cell) {
  try {
    const segments = [];
    let current = "";
    let delimiter = null;

    for (let index = 0; index < cell.length; index += 1) {
      const character = cell[index];
      if (character === "\\" && cell[index + 1] === "|") {
        current += character + cell[index + 1];
        index += 1;
        continue;
      }
      if (character === "`") {
        let end = index + 1;
        while (cell[end] === "`") end += 1;
        const run = cell.slice(index, end);
        if (delimiter === null) delimiter = run;
        else if (run === delimiter) delimiter = null;
        current += run;
        index = end - 1;
        continue;
      }
      if (character === "," && delimiter === null) {
        segments.push(current);
        current = "";
      } else {
        current += character;
      }
    }
    if (delimiter !== null) return { valid: false, paths: [] };
    segments.push(current);

    return { valid: true, paths: segments.map(decodeSegment) };
  } catch {
    return { valid: false, paths: [] };
  }
}
