# Coordinate cross-entry restoration with explicit cycles

Store one active current-draft convergence cycle in additive v3.2 project state, preserve completed cycles and scope evidence as immutable history, and block parallel manuscript-changing cycles while retaining read-only inspection. Pending action remains operation-scoped instead of becoming a lifecycle owner. This chooses explicit cross-entry restoration over free strategy switching at stable operation gates, because creation and revision can otherwise stop after manuscript changes without restoring current-draft revision convergence.

Evaluate that state through deterministic disk and evidence checks combined with structured host semantic attestations. Schema validity alone cannot prove actual reading or editorial judgment, so only current satisfied evidence passes an entry or completion gate; missing or untrustworthy proof is indeterminate, while a known failed condition is not satisfied. Coordinated per-file verified writes and identity reconciliation replace any claim of a multi-file filesystem transaction.

## Consequences

First-time creation needs an explicit bootstrap exception with a null starting scope and no claim that an empty manuscript has reached current-draft revision convergence. Ordinary starts remain blocked until a real evaluator can supply a current satisfied starting evaluation. Active updates require expected revisions, and later execution, review, evaluation, and completion operations reference the same cycle rather than creating strategy-owned state trees.
