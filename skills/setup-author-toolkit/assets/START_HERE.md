# Start here

This is an Author Toolkit writing project. The manifest, tracker, and current evidence are authoritative; reports and sessions are historical records.

- Status check: `node <setup-skill-root>/scripts/check.mjs --project-root <project-root>` from the installed `setup-author-toolkit` skill. Add `--diagnose` if it fails.
- Current navigation: Read [`PROJECT_STATE.md`](PROJECT_STATE.md) only when that check reports `Navigation cache: reusable snapshot only`. When the cache is stale or unchecked, use the bounded command results instead. The cache is a disposable generation-time snapshot.
- Project registration: [`.author-toolkit/project.json`](.author-toolkit/project.json), including the registered manuscript and operational paths.

Use `$ask-author` to choose an explicit creation or revision entry. Starting a strategy does not approve manuscript writes or publication.
