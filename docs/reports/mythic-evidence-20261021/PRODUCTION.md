# M+ production release — 21 October 2026

Status: **verified**. The reviewed M+ pages and MDT maps are live on https://gildra.net/ru/wow/mythic-plus and the English counterpart.

- Source revision: `e6e759a94c39c73b90ff68f09dc5204355afaa9a`; commits authored and committed by Shpuntyara, pushed to `fix/mythic-evidence-20261021`.
- Image: `gildra-web:mythic-evidence-20261021-e6e759a9-r1`, ID `sha256:3a8daeb2998cd5807e5ae821cbd95900d9d1d62a19106a8dd14a0026c999e34b`.
- Changed runtime: web container only; graceful Nginx reload. Runtime environment and permanent auction-state mount preserved; 33 original neighbouring containers unchanged. No database migrations or imports.
- Five exact deployed CMS preview/RUEN/tracking source fixes were retained in commit907081e9 before the M+ release.
- Candidate48 and public48 browser cases PASS: 8dungeons × RU/EN × 320/768/1440, correct mobs/pulls/status, group selection/reset/restore/JSON export, no pageerrors/overflow. Analytics/event reporting was blocked by the test browser.
- Public HTTPS26 PASS, including byte-exact hashes for all8new map images. Full production build766 pages PASS. Final observation141seconds: healthy, restarts0, unexpected errors0.

The first production build encountered image-generation timeouts while available host memory was low. That attempt did not change production. Build-only parallelism was bounded to2workers and2tasks per worker in e6e759a9; the repeated build passed. The final image revision label matches the source commit, and its runtime layers match the accepted compiled image.

Seven authored imports match the pinned MDT dataset. Temple of Sethraliss remains explicitly incompatible because clones2:14and11:7 are missing; a partial preset is not displayed as complete. Map connectors indicate pull order, not a game-verified path around obstacles.

Rollback retained: image `sha256:45767e0b792ca544e069e0d6bc800aaedbd310a1a5054218f26532c4457e9018`, protected exact prior manifest `/opt/gildra/mythic-evidence-20261021-e6e759a9-r1-previous.env`; script `/home/debian/gildra-mythic-production-20261021/rollback-web.py`. Run only under a fresh production claim and drift check. Persistent data is not restored over later user changes.

Evidence: `/home/debian/gildra-mythic-production-20261021/`: RESULT.json, source-parity.json, preserved-cms-source.json, source/build logs, operation/gate, deploy log, runtime-verification.json, public-checks.json, browser-candidate and browser-live. Protected configuration/operational env backups are in private/ and are excluded from Git. Only the task's temporary candidate was removed.
