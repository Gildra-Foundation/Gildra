# Auction optimizer audit fixes — 17 October 2026

The eight confirmed audit issues are addressed together: economic selection,
consistent exclusions, usable early results, bounded exclusion UI, measurement
reuse, responsive checkpoint persistence, optional media, and correct catalog
coverage. The audit and private reproduction evidence are retained under
`.artifacts/auction-value-audit-20261017/`; no private QA route is published.

## Resulting behavior

- New UI searches default to **price per additional confirmed DPS**. The set
  minimizes whole-set buyout cost divided by its independently simulated positive
  significant DPS gain. **Maximum DPS** is an explicit separate objective; legacy
  requests/checkpoints retain that objective. Budget is a cap, not a spend target.
- A card excludes its exact item/bonus/context/modifier variant across all lots
  and eligible slots, including newly discovered copies. Excluding a purchase
  excludes only its physical lot across slots. Both forms survive recovery and
  canonical idempotent request replay; foreign selection keys are rejected.
- Editing choices pauses discovery through the existing cancellation barrier.
  Cards, bulk selection and purchase exclusions are usable during background
  discovery. An active assembly remains protected from edits.
- Exclusions are grouped, collapsed and rendered in batches of twenty. Empty
  selection explains the disabled assembly button beside that button.
- A bounded native measurement cache reuses unchanged profile/equipment/talents,
  exact effects, encounter and verified engine results between searches. Prices
  and character ownership remain freshly checked. Old persisted engine labels
  cannot validate today's worker on their own.
- Frequent checkpoints coalesce; gzip, bulk IO and durability barriers run
  asynchronously. Final results/cancellation await flush; generation guards
  protect deletion, newer saves and lifecycle renewal. Admission, V8
  serialization and the short atomic rename remain synchronous.
- Missing icons do not block simulation. Actual cached imagery applies
  immediately, with bounded optional background enrichment.
- Catalog summaries are read without a weapon/armor-only filter. Authoritative
  known recipes, bags and quest items are distinguished from genuinely unknown
  records. Independent incomplete-data warnings are preserved.

## Validation

- Complete offline auction gate: **37 suites passed**, including new economic
  objective/synergy/checkpoint, API ownership/idempotency, variant/lot selection
  and ten asynchronous persistence regressions.
- Browser execution coverage: **124 full current scenarios + 80 legacy scenarios
  + 36 focused refinements + 8 final purchase/background checks**, all passing.
  Tests use actual components/styles/fonts, synthetic HTTP, EN/RU and 390/1440px.
  They are executions with overlap, not 248 distinct tests. Source hashes and
  private-server cleanup are recorded for every accepted run.
- TypeScript passes; ESLint has no errors and two existing controller warnings.
  Atlas validates 73 stylesheets; 86 English routes have Russian mirrors and 46
  generated mirrors are current.
- Saved real Elkardia state persistence replay: ten checkpoint scheduling calls
  took 0.52 ms; one coalesced durable flush took 242 ms. An unrelated timer ran
  81 times. One V8 serialization still produced an observed 85 ms maximum gap;
  this is not a production latency SLA or a claim of zero blocking.
- Fresh public Blizzard/realm data with the current immutable native worker,
  before deployment: Elkardia, Eversong EU, level 81. Value mode selected boots
  for **30 gold**, **+721 DPS / +3.5654%**, 95% margin approximately ±83 DPS.
  Discovery/assembly were partial and explicitly labelled as best evaluated so
  far. This is a trusted server QA run, not an authenticated browser session.

Final immutable-source, both-objective, image, deployment and post-deployment
records are recorded by the release process and appended after verification.

Evidence roots: `.artifacts/auction-fixes-release-20261017/`,
`.artifacts/auction-fixes-20261017/`,
`.artifacts/auction-persistence-fixes-20261017/`.
