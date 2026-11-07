# Validation Status

- **Release:** 4.0.0
- **Date:** 2026-11-07
- **Integration base:** `b40bd8bf3380d69d43adaaba050826f4ca3c931c`
- **Scope:** Repository contracts, the tracked developer hook, real generic installation, disposable writing-project behavior through installed public CLIs, and a minimal Kimi Code installed-skill smoke

Repository tests, installation checks, disposable-project commands, and the
minimal host smoke passed. They do not prove a complete creative run, editorial
judgment, or creative quality. Fixture reports and semantic attestations are
structural evidence only.

## Repository and developer checks

| Check | Status | Evidence |
| --- | --- | --- |
| Complete repository tests | **Pass** | `npm test`: 422 tests passed, 0 failed. Coverage includes the single 4.0.0 manifest, greenfield rejection, generated and isolated installed runtimes, pending and scope commands, typed tracker writes, backups/restores, UTC evidence time, dependency exceptions, creation and import lifecycles, independent execution, convergence evaluation and completion, cross-file recovery, deployment mirrors, Chinese procedures, the real generic-installer smoke, the tracked pre-commit behavior, and the million-character inventory regression. |
| Repository validation | **Pass** | `npm run validate`: 11 checks passed, 0 failures. Explicit `--repository` mode compiled the current schemas and validated both current example manifests, their registered state, trackers, backup indexes, and English and Chinese report fixtures. |
| Generated runtime consistency | **Pass** | `npm run check:runtime`: both checked-in self-contained ESM bundles matched a fresh build from source. |
| Existing real-installer smoke | **Pass** | `npm run smoke:installed`: the real generic installer deployed the setup skill into an isolated directory. With the temporary source removed and no development dependency resolution, both help paths, manuscript-only `init`, pending and proposed/confirmed scope writes, compact and full reads, status, project validation, usage errors, and missing/mismatched-reference diagnostics passed. |
| Tracked pre-commit checks | **Pass** | `.githooks/pre-commit` ran from a non-root working directory and completed repository validation, generated-runtime consistency, and 77 focused public CLI/evidence-contract tests with 0 failures. A temporary clone also completed a real commit with one-shot `git -c core.hooksPath=.githooks`; the same 77 tests passed. Neither that invocation nor direct hook execution wrote persistent Git configuration. |
| One-time hook opt-in | **Pass (documentation and tracked mode)** | Both READMEs document `git config --local core.hooksPath .githooks` as a manual, one-time toolkit-developer opt-in and `.githooks/pre-commit` as the configuration-free alternative. The hook is tracked as mode `100755`. Installer and setup payloads contain no hook enablement or Git-configuration write. Local and global `core.hooksPath` remained unset during acceptance. |

The full suite and the hook are separate checks. The hook is a fast commit-time
subset; it does not replace `npm test`, `npm run smoke:installed`, or the other
release gates.

## Real generic installation

The separate installation/host acceptance used Node.js 22.23.4, npm 10.9.9,
and `skills` installer 1.7.6. The installer received a temporary source
containing only the final `skills/` tree. Its `HOME` and npm cache were isolated;
no `-g`, native plugin installation, or global configuration change was used.

```bash
cd /tmp/author-toolkit-ticket-24-acceptance.V7hZKP/installation
HOME=/tmp/author-toolkit-ticket-24-acceptance.V7hZKP/home \
npm_config_cache=/tmp/author-toolkit-ticket-24-acceptance.V7hZKP/npm-cache \
npm_config_update_notifier=false DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 \
npx --yes skills@latest add /tmp/author-toolkit-ticket-24-acceptance.V7hZKP/source \
  -a kimi-code-cli --copy --yes --json
```

The installer reported all 16 skills as installed under project
`.agents/skills/`. `diff -r` found the installed tree identical to the
worktree's `skills/` tree. The temporary source was then removed. Direct
installed-CLI checks used the absolute Node executable with `env -i`, an
isolated runtime `HOME`, `PATH=""`, and `NODE_PATH=""`; they did not resolve the
repository, its `node_modules`, or its development dependencies.

Both no-argument help paths exited 0. Installed `init` created a 4.0.0 project,
compact `read` and `status` returned valid project and reference results, and
project-root validation checked the deployed references, manifest, files,
tracker, backups, and confirmed scope. The final disposable project passed 6
checks with 0 failures; the minimal host project passed 5 checks with 0
failures because it had no confirmed scope.

## Disposable manuscript-project behavior

One fixed-manuscript project used the generic installed runtime for every
public operation below. A temporary driver used the existing repository test
helper only to author report, review, coverage, no-edit, tracker-decision, and
attestation fixtures. It did not call source project operations or installed
internal functions. The public
CLI calls ran with the isolation described above.

| Operation or scenario | Result |
| --- | --- |
| Initialization and scope | `init` succeeded. Public `record-scope` proposed and confirmed `scope-001`, then proposed and confirmed post-edit `scope-002` with a different fingerprint and immutable snapshots. |
| Baseline evaluation | Public `evaluate-draft` wrote satisfied `evaluation-001` for the fixed evidence set. |
| Future timestamps | Installed artifact validation accepted an attestation exactly 60 seconds in the future relative to the injected UTC clock. The same artifact at 61 seconds exited 1 with a concrete `created_at` and 60-second diagnostic. |
| Dependency exception | Reusing the source diagnostics unit after a draft-baseline punctuation copyedit without an exception exited 1; `evaluation-002-no-exception` was `not_satisfied` with `coverage-unit-not-current`. A new unit version with exact old/new dependency hashes and a bound host attestation produced satisfied `evaluation-003`. The deterministic checks validated linkage, not the truth of the editorial claim. |
| Typed finding and duplicate | Public `record-finding` recorded open `DIAG-204`. Repeating the same typed write exited 1 with `duplicate-finding-id` and `state_written: false`; tracker bytes were unchanged. |
| Typed approvals and backup | Public `record-approval` recorded the exact `PLAN-204` and `EDIT-204` revision bindings. Public `record-backup` preserved the original manuscript and published `backup-acceptance-001`, its manifest, and its index entry. |
| Revision preparation and verification | Public `prepare-draft-revision-execution` prepared `execution-acceptance-001` with `cycle_id: null`. After the approved one-line manuscript change and target-scope confirmation, public `verify-draft-revision-execution` verified the actual output bytes and target identity. |
| Typed finding decision and final evaluation | Public `record-finding-decision` resolved `DIAG-204` against the verified execution. Public `evaluate-draft` wrote satisfied `evaluation-004`, also with `cycle_id: null`. Compact `read` and `status` then reported current satisfied evidence. |

The driver recorded 24 public calls: 21 successful calls and the three expected
failures described above (61-second timestamp, missing dependency exception,
and duplicate finding). Final installed project validation passed 6 checks with
0 failures.

Historical-preservation assertions compared actual bytes before and after the
later operations. The base and rejected evaluations, the rejected pass's host
attestation, the source coverage unit, the starting-scope snapshot, and the
backup manifest and original manuscript bytes remained unchanged. The
exception-bearing unit used a new path and hash. Preparing and then verifying
an execution was treated as the documented lifecycle transition, not as an
immutable prepared artifact.

These are disposable, fixture-driven state and evidence checks. They are not a
host-driven revision and do not certify the literary quality of the fixed
manuscript or the handwritten attestations.

## Actual Kimi Code installed-skill smoke

Kimi Code 2.4.1 ran against the same generic installation. The disposable
installation/writing-project root contained a `.git` directory, so Kimi Code
used its normal project-root `.agents/skills/` discovery. The command did not
use `--skills-dir`, `--add-dir`, a native plugin, or a user-level installation.
The explicit author entry was `/skill:setup-author-toolkit`.

```bash
cd /tmp/author-toolkit-ticket-24-acceptance.V7hZKP/installation
KIMI_CODE_NO_AUTO_UPDATE=1 KIMI_DISABLE_TELEMETRY=1 \
kimi --output-format stream-json -p '/skill:setup-author-toolkit 在当前目录执行最小 4.0.0 setup。当前目录是专用的一次性验收项目，manuscript/chapter-001.md 是既有固定验收正文，不得修改。使用 en 和默认路径。只能使用当前项目 .agents/skills/setup-author-toolkit 的安装副本及其 assets/runtime，不得使用仓库 scripts 或用户级同名旧副本。只完成初始化、共享引用部署、validate、read 和 compact status；不要填写 Story Bible 创作内容，不要记录 scope、finding、approval 或 pending action，不要启动 cycle，不要调用 write-fiction、revise-fiction、revise-draft、revise-increment、revise-request 或其他创作/修订入口。报告实际解析的 setup-skill 绝对路径、schema_version、validate/read/status 结果和下一步。'
```

The process exited 0 after 211.253 seconds; no timeout or `runtime.not_found`
warning occurred. Stream-json contained the following actual tool calls rather
than only a natural-language claim:

| Evidence | Stream-json tool call |
| --- | --- |
| Read the discovered project skill | `tool_7hZZ4x0uwJdL4rLSmZkBeSrm`: `Read .agents/skills/setup-author-toolkit/SKILL.md` |
| Run installed initialization | `tool_46sQd0SEDdpp6i6l7CiNcUl7`: installed `assets/runtime/author-project.mjs init` |
| Run installed project validation | `tool_OiQ1WM5n8FHpKzHF9kKM42vM`: installed `assets/runtime/validate.mjs --project-root` |
| Run installed compact read | `tool_TNJnQDXyFfYeJd7U3Bngmomg`: installed `assets/runtime/author-project.mjs read` |
| Run installed compact status | `tool_sdXOLJFg52EkW3cMDTKCQw8k`: installed `assets/runtime/author-project.mjs status` |

Every runtime path was beneath the disposable project's
`.agents/skills/setup-author-toolkit/` installation. The host initialized a
4.0.0 manifest, deployed 32 matching shared references, and passed project
validation with 5 checks and 0 failures. Compact read and status reported valid
project and references, null scope, pending action, and cycle, zero findings and
approvals, and an ordinary `indeterminate` new-project evaluation with
`current-evaluation-unavailable`. No active-cycle file existed.

Independent installed-CLI validation, read, and status returned the same
results with development dependency resolution disabled. The fixed manuscript
SHA-256 remained
`4b7b260ef9c1e8aaf3bce138a848230e456093236af86f3d2b90c9d59f948dcc`.
The host did not write creative Story Bible content, confirm a scope, record a
finding or approval, start a cycle, or invoke a creation/revision entry.

This verifies generic project installation, Kimi Code project auto-discovery,
the explicit setup entry, and minimal host-driven setup/read/status. It does
not verify the native plugin command or a complete creative workflow.

## Unexercised paths and quality limits

- Claude Code has no executable in this environment. Claude plugin installation
  and host invocation remain unverified.
- Kimi native `/plugins install`, the namespaced plugin skill command, Kimi
  Desktop entry, and plugin update behavior remain unverified. The successful
  bare-skill project discovery result is not native-plugin evidence.
- The one-shot `--skills-dir` fallback was not needed and was not exercised;
  the recorded host pass is the stronger default project auto-discovery path.
- The host smoke did not run scope confirmation, typed tracker writes, backup,
  revision execution, evaluation, cycle completion, or any creation/revision
  strategy. Those behaviors above are direct installed-CLI disposable-project
  results, not host-run claims.
- The integrated acceptance did not exercise restore, creation publication,
  external manuscript reconciliation, remote GitHub installation, or global
  installation. Repository contract tests cover their applicable current
  behavior but do not make them host-run evidence.
- No human editorial review, complete host creative run, or creative-quality
  evaluation was performed. Scale fixtures, report fixtures, and semantic
  attestations are not creative-quality evidence.

## Cleanup and isolation

After the results above were recorded, the temporary acceptance root
`/tmp/author-toolkit-ticket-24-acceptance.V7hZKP` was removed, including the
installation, source copy, writing projects, host stream-json logs, and the
pre-commit clone. Test-created temporary projects used registered cleanup.
No acceptance fixtures were added to the release tree.

The main and integration worktrees were not modified. The Kimi run reused the
existing login and therefore wrote ordinary session/log data under the default
Kimi Code home; no credentials or host configuration were copied, edited, or
deleted, and no global Git configuration was changed. No parent or legacy issue
was closed or retriaged, and no pull request or push was created.
