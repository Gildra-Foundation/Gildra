# Shared CMS — task status (Claude Opus 5.5 implementation turn)

Date: 2026-10-08. Branch `codex/shared-payload-admin`, base `06697ac4`. Not committed.

Done and verified (evidence: `cms/IMPLEMENTATION.md`):

- [x] S1 Sites, staff roles, multi-tenant plugin (3.88.0, now 3.90.2), access rewrite (no `Boolean(req.user)` authority)
- [x] S1 Migration with legacy backfill (documents + versions), per-site slug uniqueness, guarded rollback
- [x] S2 Article editor: drafts, autosave, versions/restore, cover, author, categories/tags, SEO, game context, preview
- [x] S3 Pages (legacy fields kept), site settings (one per site)
- [x] S4 Readers + public profiles, site-scoped login, verification, reset, blocking, honest email state
- [x] S5 Jobs: scheduled publishing with rights guard, signed per-site cache invalidation with retries, worker
- [x] S6 Plausible Stats API v2 client, authorized endpoint, admin view and dashboard table
- [x] Gildra receiver `app/api/cms/revalidate`

Open (not in this turn):

- [ ] Independent Codex review incl. real browser journeys
- [x] Frontend adapters: Gildra page blocks + `/wow/articles`, RiftDen async CMS-aware articles (see frontend-implementation.md)
- [x] Reader proxy and pages on both sites; second-site enrollment
- [x] Signed invalidation receivers on both sites (immediate expiry for removals, tested end to end)
- [x] Opt-in Plausible tracker on both sites
- [x] RiftDen MDX import (AST converter + dry run, CMS drafts importer)
- [x] Stage 4: Payload 3.90.2 / Next 16.3.8 / sharp 0.35.5 / nodemailer 10 upgrade (0 high/critical runtime advisories in all three apps), reader deletion with profile, "Choose a site" instead of a blank create view, legacy hash upgrade verified, RiftDen proxy loop, N+1 and SEO metadata fixed, runtime CMS on CMS-less builds
- [x] Stage 5: analytics tiles bound to the (site, period) they were fetched for (browser regression 6/6); Vitest 4.1.11 — full and runtime audits 0 critical/high, 5 moderate (one esbuild dev-server advisory via drizzle-kit, documented)
- [ ] External preview mode in the site frontends (CMS-local preview exists)
- [ ] Real SMTP / Plausible CE configuration; Docker build and compose validation
- [ ] Production rollout — separate explicit approval

Decisions recorded: all existing pages incl. `league-of-legends/*` stay on Gildra;
plain text slugs + `(site, slug)` unique index; shared RU/EN publication status;
first account and all legacy admins are platform owners.
