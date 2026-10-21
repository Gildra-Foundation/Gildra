# The Venomous Abyss — review, 2026-10-21 UTC

Delivered `apps/web/data/wow/raid-reviews/venomous-abyss.json`: eight encounter reviews in Russian and English, strategy notes, dated source links, 37 existing authentic spell-icon bindings and an explicit publication boundary. Shared memory read from `/var/lib/gildra/codex-team/memory/gildra/`; changes limited to assigned JSON and this report. No commit, push, deployment or production write.

## Verified updates

- [Official raid announcement](https://news.blizzard.com/en-us/article/24294062/curse-of-ulatek-the-venomous-abyss-raid-finder-wing-3-now-live) independently confirms all eight identities, level90, LFR minimum273, story mode and four regional-reset LFR wings. [Season announcement](https://news.blizzard.com/en-us/article/24294369/midnight-season-2-is-now-live) confirms Season2. Dates are reset weeks, not simultaneous worldwide instants.
- [Official hotfix ledger through October20](https://news.blizzard.com/en-gb/article/24307310/hotfixes-october-20-2026): October13 Mythic Altar now has8 initial orbs,4 mutations,6-yard mutation radius,3 Dreadmarch targets; Mythic Sszorak takes5 seconds longer to reach100 rage. October16 fixed Watch Out Behind You for groups larger than20. Existing source still says8-yard mutation radius: root notified to correct it.
- [October6 official ledger](https://news.blizzard.com/en-gb/article/24296142/hotfixes-october-6-2026): Serpent’s Bite requires no more than3 soakers regardless of raid size; Mythic tail emits3 waves rather than7. September15 entry removes Caustic Claws pools on Heroic Sszorak. Old editorial guide still contains that Heroic pool advice: superseded explicitly in new notes.
- [Current loot guide](https://www.icy-veins.com/wow/news/venomous-abysss-final-two-bosses-drop-gear-10-item-levels-past-max/) confirms final two Mythic bosses344/Myth9/6. Do not revert344 to324. Slumbering Coil Curio redemption uses the original tier boss item level, not344. Existing lower difficulty bands and tier-slot mapping agree with [raid overview](https://www.icy-veins.com/wow/venomous-abyss-raid-guide). This is editorial confirmation; no authenticated live item API was queried.

## Icon evidence

Read original `venomous-abyss-icon-audit.json` and queried current public Wowhead retail spell tooltip for every one of37 displayed IDs. Downloaded each original Blizzard render or Wago CASC source in memory, hashed it, and compared with existing provenance. Read all37 local assets and checked hashes.

-37/37 local assets exist and equal their original recorded local SHA256.
-37/37 original source bytes equal their recorded source SHA256.
-36 tooltip icon names match exactly; Call of the Serpent1300751 returns numeric8125100, which exactly equals its recorded icon file-data ID. Thus37/37 identities match; numeric response is not a missing icon.
-Wago CASC assets can be BLP converted to PNG: raw source hash intentionally differs from local PNG hash. Each is compared against its correct recorded hash, never against the other encoding.
-No missing assets among these37; no invented replacements or generic icons added. The new review bindings expose existing authentic icons for all eight encounters. Safe audit scratch: `/tmp/gildra-venomous-evidence/icon-live.json`.

## Validation and limits

PASS: JSON parse, eight unique boss slugs, nonempty RU/EN summaries and paired tips, encounter sources and icon bindings;37 asset hash checks,37 current tooltip identities and37 original remote source hash checks. No frontend build/browser checks run by this encounter agent; root performs integration.

Guidance is qualitative editorial strategy, with explicit official hotfix corrections. It does not certify unresolved exact-build spell descriptions or damage numbers, Hall of Fame vacancy, exact current mount quantities, or every Mythic mechanic. Existing publication guards remain authoritative. Next: root integrates the review, corrects obsolete6-yard/soak guidance in owned shared files, and runs complete bilingual browser/build checks before offering publication.
