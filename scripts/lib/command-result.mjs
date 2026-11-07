export function requiredAction(operation) {
  return {
    strategy: "author-project",
    operation,
    command: `author-project ${operation}`,
  };
}

export function failure(code, message, operation, details = {}) {
  return {
    valid: false,
    state_written: false,
    required_action: requiredAction(operation),
    blockers: [{ code, message, ...details, required_action: requiredAction(operation) }],
    ...details,
  };
}

export function commandError(code, message, details = {}) {
  const error = new Error(message);
  error.projectCode = code;
  error.projectDetails = details;
  return error;
}
