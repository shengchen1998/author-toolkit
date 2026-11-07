# Author Toolkit

Author Toolkit coordinates fiction creation and revision over shared evidence for one book. Its domain language distinguishes author-selected strategies, operation-scoped work, and the cross-entry lifecycle that restores revision quality after manuscript changes.

## Language

**Project response envelope**:
The versioned JSON response used by every public project operation, containing `response_contract_version`, `command`, `valid`, `result`, and structured `errors`. No-argument help is not an operation response.

**Compact project status**:
The default `read` and `status` view containing project and reference validation, scope identity and file count, pending action, active cycle and recovery position, evaluation outcome and blockers, decision counts, and exact next action. Full identities and evidence require an explicit full or dedicated query.

**Current-draft revision convergence**:
The derived state in which all shared evidence, decision, coverage, execution, and review conditions hold for a confirmed target scope after the latest manuscript change.
_Avoid_: Publication, request completion, a stored convergence flag

**Current-draft convergence cycle**:
The authoritative cross-entry lifecycle connecting an initial full-manuscript convergence evaluation to a later target evaluation and an explicit completion decision.
_Avoid_: Strategy, operation, requested pass, pending action

**Cycle operation record**:
The manifest `cycle_operation` coordination record for one operation's kind, operation ID, cycle ID, expected and intended revisions, optional artifact ID, and creation time. It is not a second lifecycle owner or manuscript approval.

**Cycle reconciliation**:
The public `reconcile-cycle` diagnosis and explicit-direction recovery of interrupted cycle, manifest, pending, artifact, and lock coordination. It preserves immutable history and does not claim a multi-file filesystem transaction.

**Completed-cycle pointer**:
The manifest `last_completed_cycle` reference to one immutable completed cycle by ID, revision, path, and SHA-256. It coordinates active-record removal and is not a permanent convergence flag.

**Bootstrap**:
The explicitly marked first-time creation exception for an empty manuscript with no starting scope. Its first nonempty publication resumes the same cycle through `revise-draft` and establishes the initial full-manuscript evaluation rather than assuming an empty starting point has reached current-draft revision convergence or routing to `revise-increment`.

**Starting scope**:
The immutable full-manuscript scope verified as having reached current-draft revision convergence before a cycle changes the manuscript. Request base scope and increment previous scope are strategy-specific names for this role.
_Avoid_: Whichever scope happens to be current after later edits

**Scope fingerprint**:
The deterministic content identity of ordered manuscript path/hash pairs and sorted exclusions, independent of scope record metadata and confirmation time.

**Inventory snapshot**:
The immutable manuscript-inventory evidence preserved when a scope is confirmed.

**Inventory fingerprint**:
The deterministic content identity of a manuscript root, its path-sorted file versions, and sorted exclusions.

**Target scope**:
The confirmed scope whose complete paths, evidence, review, and completion state a strategy must address.
_Avoid_: Work set

**Requested pass**:
The explicitly requested operations, paths, language, subchecks, dependencies, applicability, narrowing, and gaps for one revision effort.

**Requested-pass fingerprint**:
The deterministic content identity of a requested pass, independent of its record ID, decisions, and timestamps.

**Dependency exception**:
A recorded allowance to reuse one full local coverage unit when a draft-baseline or revision-plan dependency's content hash changed through copy editing without a meaning change, bound to one requested pass, exact old and new dependency versions, and host semantic attestation. It never applies to manuscript or other evidence identity changes.
_Avoid_: Carry-forward, baseline pass, no-edit skip

**Change set**:
The observed created, modified, deleted, reordered, evidence-affected, and dependency-affected paths between two manuscript states.
_Avoid_: Author intent, required work

**Manuscript reconciliation**:
The immutable record joining an exact external manuscript inventory and author import decision to reconciled story state, observed changes, affected evidence, and the required recovery route. It never writes manuscript or substitutes for backup and restore approvals.
_Avoid_: Silent scope-hash refresh, a caller-supplied confirmation flag

**Work set**:
The target-scope paths requiring new evidence or approved edits after considering requests, observed changes, dependencies, and reusable evidence.
_Avoid_: Target scope, request set

**Convergence evaluation**:
An immutable judgment of current-draft revision convergence bound to exact scope and evidence identities. Its outcome is satisfied, not satisfied, or indeterminate; missing trustworthy proof is indeterminate rather than success or a known editorial defect. Cycle-bound evaluations record their cycle ID; independent revise-draft evaluations record `cycle_id: null` and require no cycle completion decision.

**Request completion**:
The independent state in which every approved request batch and request decision is finished through verified current executions or lawful no-edit decisions. It does not imply current-draft revision convergence.

**Semantic attestation**:
A structured host statement identifying editorial claims, the attester, and the exact pass, scope, and artifact evidence supporting those claims. It does not replace an author decision or prove its own underlying judgment.

**Evidence graph**:
The immutable artifact roles, identities, paths, and content hashes bound to one evaluation. Current status recomputes every hash; the graph excludes the living cycle and the evaluation itself to avoid self-hashing.

**No-edit skip**:
The recorded author decision that revision planning and chapter revision require no manuscript edit for one requested pass and target fingerprint, including every covered finding and the reason.

**Revision execution record**:
The verified record linking revision intent and approvals to actual input and output manuscript versions. Cycle-bound records carry their cycle ID; independent revise-draft records use `cycle_id: null`.
_Avoid_: Approval without execution

**Backup manifest**:
The immutable identity of an approved backup operation, scope, ordered actions, expected absence, and preserved original-byte versions.

**Backup index**:
The living recovery-data index whose backup manifests, original bytes, and restoration records validate together beneath registered `paths.backups`.

**Safety backup**:
The current input bytes and explicit absence preserved before any approved restoration mutates manuscript.

**Restoration record**:
The append-only identity linking a source backup or creation commit, independent restore approval, safety backup, and exact inverse actions. It does not confirm a resulting scope or current evidence.

**Review group**:
The binding of intent, standards, and fresh-reader review evidence to one requested pass and target fingerprint, including the fresh reader's continuity evidence.

**Recovery position**:
The active cycle's required operation, reason, and strategy for its exact next action.
_Avoid_: Pending action, permission to write

**Completion decision**:
The author's explicit decision to complete a cycle after its target evaluation is satisfied and current.

**Pending action**:
The operation-scoped record of requested, interrupted, or awaiting work and its author gate. Optional cycle, revision, operation, and scope-fingerprint fields are coordination references only.
_Avoid_: Cycle ownership, lifecycle history, write, publication, restore, or completion approval

**Convergence status**:
The read-only description of evaluation outcome, currency, active lifecycle, pending action, recovery position, and blockers. A valid query can report an unfinished lifecycle without calling it malformed.

**Convergence gate**:
The read-only check that permits dependent work only when a current evaluation is satisfied.

**Project migration**:
The direct, preserved conversion of a v2, v3.0, or v3.1 project to v3.2, including historical evidence and pending work. Migration creates no satisfied evaluation, active cycle, or author decision.
_Avoid_: Historical convergence inference, intermediate v3.1 migration state

**Legacy recovery**:
The explicit diagnosis and author-directed reconciliation of interrupted or awaiting work retained by project migration, without inferring cycle ownership, approval, publication, or convergence.
_Avoid_: Pending-action approval, automatic staging publication

**Legacy scope confirmation**:
An existing approved tracker row with type `scope-confirmation`, operation `intake`, exact scope ID and ordered paths, and matching scope-fingerprint and reading-order tokens. Migration may reference it but never creates it.
_Avoid_: Placeholder approval, inferred reading-order confirmation
