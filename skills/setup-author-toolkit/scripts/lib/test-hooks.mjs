export function injectTestFailure(name) {
  if (process.env.AUTHOR_TOOLKIT_TEST_FAILURE === name) {
    const error = new Error(`injected failure: ${name}`);
    error.code = "ERR_WRITE_GATE";
    throw error;
  }
}
