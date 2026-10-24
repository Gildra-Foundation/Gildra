# Gildra: verified Shpuntyara work recovery

This records source work from 18–24 October 2026 and the owner-authorized attribution correction. Existing authors and committers are retained. Shared integration commits receive a Shpuntyara coauthor trailer; new recovered task commits are authored and committed by Shpuntyara.

## Existing shared work

| Original | Corrected | Work |
| --- | --- | --- |
| `0a2d38c0` | `8cc04d59` | Valyro CMS, workflows and recovery |
| `7b882daf` | `94ebc1e0` | Static dungeon pulls |
| `525ad98b` | `10848afd` | Pull briefings |
| `895abe6b` | `412e54c4` | Reviewed NPC/mechanic data |
| `b3be0f78` | `00e92600` | Roles, player tools and talent import |
| `4a509f29` | `acf793f5` | Saved build library |
| `a72873ff` | `bf81e8f1` | Account build storage |
| `e4802150` | `5f0159d7` | Sharing builds |

Every existing commit keeps its original source tree. Only eight messages gain a coauthor; 230 descendant commits acquire new parent SHAs without changes to their authors, committers, messages or code. All existing coauthor trailers remain in the same Git trailer block. The source tree before and after attribution correction is identical.

## Recovered published source

- `b82541b6`: home-book (4 task files).
- `95c9dfda`: shared-talent-tree (11 task files).
- `e5838e75`: home-writing (4 task files).
- `fe251591`: edit-shared-build-final (11 task files).
- `3cc96651`: home-slower (2 task files).
- `f8917ff2`: story-library (34 task files).
- `68990b77`: visible-calculator (5 task files).
- `b7ebee57`: dungeon-glass (43 task files).
- `6c3a928f`: calm-art (19 task files).
- `1e10390f`: hide-character-training (1 task files).
- `7b68e791`: auction-effects (4 task files).
- `6f07437d`: seamless-footer (2 task files).
- `174f2a1b`: hide-gear-comparison (1 task files).

Only the task deltas from checksum-verified release sources are added. Unrelated current master changes, including catalog/PostgreSQL and backup work, are preserved. The new source delta covers 123 files; production deployment is outside this operation.

## Completed work on separate feature branches

- `feature/shpuntyara-data-hub-20261024` (`d8fb1c13`).
- `feature/shpuntyara-mvp-staging-20261024` (`2f994f7c`).
- `feature/shpuntyara-instance-themes-20261024` (`5190210d`).
- `chore/shpuntyara-shared-memory-20261024` (`602f54fd`).
- `feature/shpuntyara-auction-browser-20261024` (`45e9032e`).

These are the original reviewed implementations, retained on compatible historical baselines. The old MVP and selector themes are not replacements for current production. Data Hub migrations 173/174 require reconciliation with current master before integration. Daily collection remains unactivated by this operation. The memory branch contains only the loader, tests and documentation; user configuration and private notes are excluded.

## Verification and exclusions

74 named frontend tests and 6 memory tests pass. TypeScript, Atlas (92 stylesheets), Valyro sources/theme, RU/EN route parity, generated mirrors and CRLF-aware diff checks pass. High-confidence credential patterns were checked in 352 changed text files with zero findings. Private runtime configuration, raw logs and browser captures are excluded. Claude motion/design commits and unrelated Zulut30 changes receive no new attribution.

The original master is preserved at `backup/before-shpuntyara-attribution-20261024`. History replacement uses an exact remote SHA lease; it must stop on any concurrent master update.
