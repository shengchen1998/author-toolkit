function markdown(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("\r", " ").replaceAll("\n", " ").trim();
}

export function concise(value, limit = 240) {
  const characters = [...markdown(value)];
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

export function code(value) {
  return `\`${markdown(value)}\``;
}

export function manifestNavigationFields(manifest) {
  const scope = manifest.current_scope;
  const pending = manifest.pending_action;
  return {
    scope: `- Scope: ${scope ? `${code(scope.scope_id)} (${scope.status}; ${scope.files.length} file${scope.files.length === 1 ? "" : "s"})` : "none recorded"}`,
    pendingAction: `- Pending action: ${pending ? `${code(pending.operation)} (${pending.status})` : "none recorded"}`,
    pendingScope: `- Pending scope: ${pending?.scope_id ? code(pending.scope_id) : "none recorded"}`,
    pendingReason: `- Pending reason: ${pending ? concise(pending.reason) : "none recorded"}`,
  };
}
