# Quick auction selection by default

The default auction action previously continued exhaustive comparison until the entire candidate pool finished. Users now receive a bounded, measured loadout first, with an explicit Full search action for exhaustive continuation.

## Behavior

Quick selection advances at most three completed search turns, checking a 45-second cooperative budget between turns, then runs at most one assembly turn if authoritative, non-excluded candidates exist. The time budget is not a hard response-time promise: an in-flight upstream/native operation may finish later. Single-item incompatibility does not prevent assembly because a simultaneous replacement can repair a unique-equipment or hand constraint.

First assembly prioritizes a whole-set seed over additional discovery. Restored contexts still validate the worker engine. Pending candidates are retained, and the next full continuation resumes discovery. Native iteration count, uncertainty checks, budget and lot constraints are unchanged.

Full search is an explicit separate action. It reuses the owned search identity, exclusions, measured simulations and assembly incumbents, advances the remaining candidate pool, and then completes assembly and requested encounter comparisons. It does not start a fresh search merely to switch modes.

Quick/full intent, phase, completed-turn counters and the last completed job identity are stored with the existing scoped browser recovery handle. Duplicate completed responses do not replenish the quick budget. Cancellation marks the orchestration done. Legacy caches default to quick; reading legacy completed facts does not initiate new work.

## Result integrity

Incomplete results say Best among checked rather than claiming a global optimum or pretending calculation is still running after quick selection stops. No significant measured gain remains No confirmed upgrade. Equipment-only recommendations expose unknown enhancement totals honestly. When the objective is value and no fully priced result exists, known equipment cost per measured gain selects the equipment result rather than silently falling back to maximum DPS.

No API schema, database migration, native worker settings or shared design-reference components change.
