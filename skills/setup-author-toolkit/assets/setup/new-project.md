# New-project setup

Use this branch only when `<project-root>/.author-toolkit/project.json` is absent. Run `node <setup-skill-root>/scripts/inspect-root.mjs --project-root <project-root> --json` for the bounded discovery described in step 1 of `../../SKILL.md`. Select from its candidate manuscript paths and default component types, using targeted checks only for an author-supplied path or an omitted candidate that needs disambiguation; do not enumerate historical artifact trees.

1. Read `../../../author-project/SKILL.md` and `../../../author-project/references/operations.md`, then follow their new-manifest procedure directly with the selected root and paths, project metadata, and BCP 47 language. Register existing paths as they are. Use these defaults only for missing components:
   - `manuscript/`
   - `story-bible.md`
   - `audit-tracker.md`
   - `reports/`
   - `sessions/`
   - `.author-toolkit/backups/`
   - `.author-toolkit/handoffs/`
   - `.author-toolkit/creation/`
2. Create missing directories and write only missing skeleton files. Use `../../../author-project/assets/story-bible-template.md` and the neutral `../../../author-project/assets/audit-tracker-template.md`. Write supplied project metadata only where the templates request it and leave creative fields empty. Fill the new tracker's project root and manifest timestamp. Leave current scope and pending action unset for the selected skill to establish with the author.
3. Finish the new project with a separate `validate` call before returning to step 3 of `../../SKILL.md` for entry-file installation and the final diagnostic check.

No current-draft revision convergence exists before the selected strategy establishes and verifies a scope. Do not infer eligibility for `revise-request` or a previous scope for `revise-increment` from new-project setup.
