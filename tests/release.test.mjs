import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

test("4.0.0 release metadata and the neutral project template agree", async () => {
  const [packageMetadata, packageLock, kimiPlugin, claudePlugin, marketplace, template] =
    await Promise.all([
      readJson("package.json"),
      readJson("package-lock.json"),
      readJson("kimi.plugin.json"),
      readJson(".claude-plugin/plugin.json"),
      readJson(".claude-plugin/marketplace.json"),
      readJson("skills/author-project/assets/project-template.json"),
    ]);

  const versions = {
    "package.json": packageMetadata.version,
    "package-lock.json": packageLock.version,
    "package-lock.json packages['']": packageLock.packages[""].version,
    "kimi.plugin.json": kimiPlugin.version,
    ".claude-plugin/plugin.json": claudePlugin.version,
    ".claude-plugin/marketplace.json": marketplace.plugins[0].version,
  };
  for (const [location, version] of Object.entries(versions)) {
    assert.equal(version, "4.0.0", location);
  }
  assert.equal(template.schema_version, "4.0.0");
});
