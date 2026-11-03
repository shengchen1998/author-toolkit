import { ACTIVE_STATUSES, STAGES } from "./constants.mjs";

function workflowError(instancePath, message) {
  return { instancePath, keyword: "workflow", message, params: {} };
}

function stagePath(index, suffix = "") {
  return `/workflow/stages/${index}${suffix}`;
}

export function validateWorkflow(project) {
  const errors = [];
  const workflow = project?.workflow;

  if (!workflow || !Array.isArray(workflow.stages)) {
    return {
      valid: false,
      errors: [workflowError("/workflow", "workflow with a stages array is required")],
    };
  }

  const { stages, current_stage: currentStage } = workflow;

  if (stages.length !== STAGES.length) {
    errors.push(workflowError("/workflow/stages", `exactly ${STAGES.length} stages are required`));
  }

  for (const [index, expectedName] of STAGES.entries()) {
    if (stages[index]?.name !== expectedName) {
      errors.push(
        workflowError(stagePath(index, "/name"), `stage ${index} must be ${expectedName}`),
      );
    }
  }

  for (const [index, stage] of stages.entries()) {
    if (stage.status === "stale" && !stage.reason) {
      errors.push(workflowError(stagePath(index, "/reason"), "stale stages must record a reason"));
    }
    if (stage.status === "blocked" && !stage.reason) {
      errors.push(workflowError(stagePath(index, "/reason"), "blocked stages must record a reason"));
    }
  }

  const currentIndex = currentStage === "complete" ? STAGES.length : STAGES.indexOf(currentStage);
  if (currentIndex < 0) {
    errors.push(workflowError("/workflow/current_stage", "unknown current stage"));
    return { valid: false, errors };
  }

  if (currentStage === "complete") {
    for (const [index, stage] of stages.entries()) {
      if (!["complete", "skipped"].includes(stage.status)) {
        errors.push(
          workflowError(
            stagePath(index, "/status"),
            "all stages must be complete or skipped when current_stage is complete",
          ),
        );
      }
    }
  } else {
    const current = stages[currentIndex];
    if (current && ["complete", "skipped", "stale"].includes(current.status)) {
      errors.push(
        workflowError(
          stagePath(currentIndex, "/status"),
          "the current stage must be actionable; advance current_stage after completion or resume stale work first",
        ),
      );
    }

    for (let index = 0; index < currentIndex; index += 1) {
      if (!["complete", "skipped", "stale"].includes(stages[index]?.status)) {
        errors.push(
          workflowError(
            stagePath(index, "/status"),
            "stages before current_stage must be complete, skipped, or explicitly stale",
          ),
        );
      }
    }

    for (let index = currentIndex + 1; index < stages.length; index += 1) {
      if (ACTIVE_STATUSES.includes(stages[index]?.status)) {
        errors.push(
          workflowError(
            stagePath(index, "/status"),
            "a downstream stage cannot be active while current_stage points upstream",
          ),
        );
      }
    }
  }

  const firstStaleIndex = stages.findIndex((stage) => stage.status === "stale");
  if (firstStaleIndex >= 0) {
    for (let index = firstStaleIndex + 1; index < stages.length; index += 1) {
      const stage = stages[index];
      if (
        [...ACTIVE_STATUSES, "complete"].includes(stage.status) &&
        !stage.override_reason
      ) {
        errors.push(
          workflowError(
            stagePath(index, "/override_reason"),
            "active or completed work downstream of a stale stage requires an override_reason",
          ),
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateWorkflowSequence(projects) {
  const errors = [];

  if (!Array.isArray(projects) || projects.length < 2) {
    return {
      valid: false,
      errors: [workflowError("", "a workflow sequence needs at least two project snapshots")],
    };
  }

  projects.forEach((project, index) => {
    for (const error of validateWorkflow(project).errors) {
      errors.push({ ...error, instancePath: `/projects/${index}${error.instancePath}` });
    }
  });

  for (let index = 1; index < projects.length; index += 1) {
    const previous = projects[index - 1]?.workflow;
    const next = projects[index]?.workflow;
    if (!previous || !next) continue;

    const previousIndex = STAGES.indexOf(previous.current_stage);
    const nextIndex = STAGES.indexOf(next.current_stage);
    if (previousIndex < 0 || nextIndex < 0 || nextIndex >= previousIndex) continue;

    for (let stageIndex = nextIndex + 1; stageIndex < STAGES.length; stageIndex += 1) {
      const before = previous.stages[stageIndex];
      const after = next.stages[stageIndex];
      if (!before || !after || after.override_reason) continue;

      if (before.status === "complete" && after.status !== "stale") {
        errors.push(
          workflowError(
            `/projects/${index}${stagePath(stageIndex, "/status")}`,
            `rework from ${previous.current_stage} to ${next.current_stage} must mark completed downstream stage ${STAGES[stageIndex]} stale`,
          ),
        );
      } else if (
        ACTIVE_STATUSES.includes(before.status) &&
        !["stale", "not_started"].includes(after.status)
      ) {
        errors.push(
          workflowError(
            `/projects/${index}${stagePath(stageIndex, "/status")}`,
            `active downstream stage ${STAGES[stageIndex]} must become stale or not_started after rework`,
          ),
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
