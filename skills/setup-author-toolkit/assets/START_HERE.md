# Start here

This is an Author Toolkit writing project. The manifest, tracker, and current evidence are authoritative; reports and sessions are historical records.

- Status check: Follow [`AGENTS.md`](AGENTS.md#run-creation-or-revision-from-shared-state) for the shared-state check and failure handling.
- Current navigation: The optional `PROJECT_STATE.md` cache does not exist until the first successful `--digest` refresh. Read it only after that refresh or when a later check reports `Navigation cache: reusable snapshot only` (JSON `navigation_cache.reusable` is `true`). When the cache is absent, stale, or unchecked, use the bounded command results instead. The cache is a disposable generation-time snapshot.
- Project registration: [`.author-toolkit/project.json`](.author-toolkit/project.json), including the registered manuscript and operational paths.

Start `ask-author` through your host's skill command or skill picker to choose an explicit creation or revision entry. Starting a strategy does not approve manuscript writes or publication.
