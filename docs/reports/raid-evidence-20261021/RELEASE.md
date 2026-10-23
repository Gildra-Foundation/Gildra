# Raid production release — 2026-10-21

Published on https://gildra.net/ru/wow/raids. Verified at 2026-10-21T21:17:43.373391+00:00.

- Source revision: `2c3ac8d635ee292554f1c0be4c030fdbe985cb7a`. Image: `gildra-web:raids-20261021-2c3ac8d635ee`; immutable ID `sha256:c930b57aeef4ce63e822d70b371452dbb005c915300ae8d3b05e1b03a019c8f0`.
- Five raids / 18 bosses: reviewed RU/EN mechanics, source dates and links, real spell icons and Sporefall portrait. Full editorial evidence and limitations: [REPORT.md](REPORT.md).
- Preserved the deployed CMS preview / RU-EN / tracking fixes (five exact source hashes), latest Mythic+ content and maps (38 unchanged files), bounded build settings, runtime settings and persistent auction-state mount. Raid manifest: 139 source/assets hashes. Current master was merged without application changes.
- Candidate and public production each passed 96 raid browser cases, 170 HTTP/icon integrity checks and eight CMS-boundary/MDT browser cases. Production observation: 129.5 seconds, healthy, zero restarts or unexpected runtime errors; 15 protected containers unchanged. Production build: 766 pages.
- Only web was recreated; Nginx passed syntax check and graceful reload. No database migration or CMS/account writes. Compose, Nginx configuration and unrelated release settings retained their hashes.
- Rollback retained: `gildra-web:mythic-evidence-20261021-e6e759a9-r1`, immutable ID `sha256:3a8daeb2998cd5807e5ae821cbd95900d9d1d62a19106a8dd14a0026c999e34b`. Manifest backup: `/opt/gildra/raids-20261021-2c3ac8d6-r1-previous.env`; guarded helper and private configuration backups: `/home/debian/gildra-raid-production-20261021/`. Rollback was prepared, not executed.
- Operational evidence: `/home/debian/gildra-raid-production-20261021/RESULT.json`, `source-preservation.json`, production HTTP/browser reports, observation and hash-chained ledger. An initial observation reported a transient nginx snapshot difference; subsequent identity/mount diagnostics matched, and a full repeat with mount order normalized passed. The original attempt is retained.

Verification uses public sources and browser checks. No in-game raid runs, real OAuth flow or signed CMS preview flow were performed in this release.
