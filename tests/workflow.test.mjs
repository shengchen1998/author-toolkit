import assert from "node:assert/strict";
import test from "node:test";

import { validateManifest, validateWorkflowSequence } from "../scripts/lib/index.mjs";
import { clone, readManifest, readWorkflowProjects } from "./helpers.mjs";

test("structure rework, interruption recovery, and reruns form a valid sequence", async (t) => {
  for (const language of ["en", "zh"]) {
    await t.test(language, async () => {
      const { fixture, projects } = await readWorkflowProjects(language);
      for (const project of projects) {
        const result = validateManifest(project);
        assert.deepEqual(result.errors, []);
        assert.equal(result.valid, true);
      }
      assert.deepEqual(validateWorkflowSequence(projects).errors, []);

      const [before, rework, resumed, rerun] = projects.map((project) => project.workflow);
      assert.equal(before.current_stage, "prose");
      assert.equal(rework.current_stage, "structure");
      assert.equal(before.stages[3].status, "complete");
      assert.equal(rework.stages[3].status, "stale");
      assert.equal(rework.stages[5].status, "stale");
      assert.equal(resumed.stages[3].status, "stale");
      assert.equal(rerun.current_stage, "characters");
      assert.equal(rerun.stages[2].status, "complete");
      assert.equal(rerun.stages[3].status, "in_progress");
      assert.equal(rerun.stages[4].status, "stale");
      assert.equal(fixture.fixture, true);
    });
  }
});

test("returning to structure fails if completed character work remains current", async () => {
  const { projects } = await readWorkflowProjects();
  const invalid = clone(projects);
  const rework = invalid[1].workflow;
  rework.stages[3].status = "complete";
  delete rework.stages[3].reason;

  const result = validateWorkflowSequence(invalid);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (error) =>
        error.instancePath === "/projects/1/workflow/stages/3/status" &&
        error.message.includes("must mark completed downstream stage characters stale"),
    ),
  );
});

test("resuming cannot point current_stage at stale work", async () => {
  const { projects } = await readWorkflowProjects();
  const invalid = clone(projects);
  invalid[2].workflow.current_stage = "revision-plan";

  const result = validateWorkflowSequence(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.message.includes("current stage must be actionable")));
});

test("completed work downstream of stale input needs an explicit override", async () => {
  const manifest = await readManifest();
  manifest.workflow.stages[4].status = "complete";
  delete manifest.workflow.stages[4].reason;

  const withoutOverride = validateManifest(manifest);
  assert.equal(withoutOverride.valid, false);
  assert.ok(
    withoutOverride.errors.some(
      (error) => error.instancePath === "/workflow/stages/4/override_reason",
    ),
  );

  manifest.workflow.stages[4].override_reason =
    "The author reviewed the stale input and explicitly retained this plan.";
  const withOverride = validateManifest(manifest);
  assert.deepEqual(withOverride.errors, []);
  assert.equal(withOverride.valid, true);
});
