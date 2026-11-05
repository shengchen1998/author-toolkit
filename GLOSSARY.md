# Author Toolkit

Author Toolkit coordinates fiction creation and revision over shared evidence for one book. Its domain language distinguishes author-selected strategies, operation-scoped work, and the cross-entry lifecycle that restores revision quality after manuscript changes.

## Language

**Current-draft revision convergence**:
The derived state in which all shared evidence, decision, coverage, execution, and review conditions hold for a confirmed target scope after the latest manuscript change.
_Avoid_: Publication, request completion, a stored convergence flag

**Current-draft convergence cycle**:
The authoritative cross-entry lifecycle connecting an initial full-manuscript convergence evaluation to a later target evaluation and an explicit completion decision.
_Avoid_: Strategy, operation, requested pass, pending action

**Bootstrap**:
The explicitly marked first-time creation exception for an empty manuscript with no starting scope. It establishes the first nonempty manuscript and initial evaluation rather than assuming an empty starting point has reached current-draft revision convergence.

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

**Change set**:
The observed created, modified, deleted, reordered, evidence-affected, and dependency-affected paths between two manuscript states.
_Avoid_: Author intent, required work

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
The verified record linking revision intent and approvals to actual input and output manuscript versions.
_Avoid_: Approval without execution

**Review group**:
The binding of intent, standards, and fresh-reader review evidence to one requested pass and target fingerprint, including the fresh reader's continuity evidence.

**Recovery position**:
The active cycle's required operation, reason, and strategy for its exact next action.
_Avoid_: Pending action, permission to write

**Completion decision**:
The author's explicit decision to complete a cycle after its target evaluation is satisfied and current.

**Pending action**:
The operation-scoped record of requested, interrupted, or awaiting work and its author gate.
_Avoid_: Cycle ownership, lifecycle history, write approval

**Convergence status**:
The read-only description of evaluation outcome, currency, active lifecycle, pending action, recovery position, and blockers. A valid query can report an unfinished lifecycle without calling it malformed.

**Convergence gate**:
The read-only check that permits dependent work only when a current evaluation is satisfied.
