# Gildra: verified Shpuntyara work recovery

This records source work from 18–24 October 2026 and the owner-authorized attribution correction. Existing authors and committers are retained. Shared integration commits receive a Shpuntyara coauthor trailer; new recovered task commits are authored and committed by Shpuntyara.

## Existing shared work

| Original | Corrected | Work |
| --- | --- | --- |
| `0a2d38c0` | `8cc04d59` | Valyro CMS, workflows and recovery |
| `7b882daf` | `5017b445` | Static dungeon pulls |
| `525ad98b` | `c57a78d0` | Pull briefings |
| `895abe6b` | `ca8e8f4b` | Reviewed NPC/mechanic data |
| `b3be0f78` | `db0f0aad` | Roles, player tools and talent import |
| `4a509f29` | `8d6ccf94` | Saved build library |
| `a72873ff` | `a046fee9` | Account build storage |
| `e4802150` | `6bbd51e5` | Sharing builds |

Every existing commit keeps its original source tree. Only eight messages gain a coauthor; 230 descendant commits acquire new parent SHAs without changes to their authors, committers, messages or code. The source tree before and after attribution correction is identical.

## Recovered published source

- `3e7172b4`: home-book (4 task files).
- `40d282d1`: shared-talent-tree (11 task files).
- `df497308`: home-writing (4 task files).
- `b052dba1`: edit-shared-build-final (11 task files).
- `5e1883c0`: home-slower (2 task files).
- `0414884d`: story-library (34 task files).
- `78fb9a25`: visible-calculator (5 task files).
- `ec04d1da`: dungeon-glass (43 task files).
- `e859d463`: calm-art (19 task files).
- `2ac33f8a`: hide-character-training (1 task files).
- `a5ea8c74`: auction-effects (4 task files).
- `6ade9ecc`: seamless-footer (2 task files).
- `29cb2035`: hide-gear-comparison (1 task files).

Only the task deltas from checksum-verified release sources are added. Unrelated current master changes, including catalog/PostgreSQL and backup work, are preserved. The new source delta covers 123 files; production deployment is outside this operation.

## Completed work on separate feature branches

- `feature/shpuntyara-data-hub-20261024` (`d8fb1c13`).
- `feature/shpuntyara-mvp-staging-20261024` (`2f994f7c`).
- `feature/shpuntyara-instance-themes-20261024` (`5190210d`).
- `chore/shpuntyara-shared-memory-20261024` (`dbaed1ba`).

These are the original reviewed implementations, retained on compatible historical baselines. The old MVP and selector themes are not replacements for current production. Data Hub migrations 173/174 require reconciliation with current master before integration. Daily collection remains unactivated by this operation. The memory branch contains only the loader, tests and documentation; user configuration and private notes are excluded.

## Verification and exclusions

74 named frontend tests and 6 memory tests pass. TypeScript, Atlas (92 stylesheets), Valyro sources/theme, RU/EN route parity, generated mirrors and CRLF-aware diff checks pass. High-confidence credential patterns were checked in 334 changed text files with zero findings. Private runtime configuration, raw logs and browser captures are excluded. Claude motion/design commits and unrelated Zulut30 changes receive no new attribution.

The original master is preserved at `backup/before-shpuntyara-attribution-20261024`. History replacement uses an exact remote SHA lease; it must stop on any concurrent master update.
