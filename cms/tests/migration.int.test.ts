import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type pg from "pg";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrations } from "../src/migrations";
import { ROLLBACK_CHECKS } from "../src/migrations/20261008_174758_shared_cms";
import { seedSites } from "../src/seed/sites";
import { withClient } from "./helpers/db";
import { bootPayload } from "./helpers/payload";

let payload: Payload;
let url: string;

const SHARED = migrations[2].name;

/** Run the real Payload CLI against the scratch database (as an operator would). */
async function cli(...args: string[]): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await promisify(execFile)("npx", ["payload", ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PAYLOAD_DATABASE_URL: url, NODE_OPTIONS: "--no-deprecation" },
      timeout: 240_000,
    });
    return { ok: true, output: stdout + stderr };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}
const q = (sql: string, params: unknown[] = []) => withClient(url, (c: pg.Client) => c.query(sql, params));
const count = async (table: string) => Number((await q(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n);
const ids = async (table: string) => (await q(`SELECT id FROM "${table}" ORDER BY id`)).rows.map((r) => r.id);

/** Labels of rollback checks that currently block `down` (same SQL as the migration). */
async function blockers(): Promise<string[]> {
  const out: string[] = [];
  for (const [label, query] of ROLLBACK_CHECKS) {
    if (Number((await q(query)).rows[0]?.n ?? 0) > 0) out.push(label);
  }
  return out;
}

const LEGACY_HASH = "legacy-hash-value";
const LEGACY_TABLES = ["admins", "media", "media_locales", "guides", "guides_locales", "_guides_v", "_guides_v_locales", "pages", "pages_locales", "_pages_v", "_pages_v_locales"];
let legacyCounts: Record<string, number>;
let legacyIDs: Record<string, number[]>;

const lex = (text: string) => JSON.stringify({ root: { type: "root", version: 1, direction: "ltr", format: "", indent: 0, children: [{ type: "paragraph", version: 1, direction: "ltr", format: "", indent: 0, textFormat: 0, children: [{ type: "text", version: 1, text, detail: 0, format: 0, mode: "normal", style: "" }] }] } });

/** Rows shaped exactly like the production schema before this change. */
async function insertLegacyFixtures() {
  await q(`INSERT INTO admins (id, name, email, salt, hash) VALUES (7, 'Legacy Admin', 'legacy@test.local', 'legacy-salt', $1), (9, 'Second Legacy', 'legacy2@test.local', 'salt2', 'hash2')`, [LEGACY_HASH]);
  await q(`INSERT INTO media (id, url, filename, mime_type, filesize, width, height) VALUES (11, '/api/media/file/hero.png', 'hero.png', 'image/png', 68, 1, 1)`);
  await q(`INSERT INTO media_locales (alt, _locale, _parent_id) VALUES ('Hero', 'en', 11), ('Герой', 'ru', 11)`);
  // A published guide with an older draft version and a published version.
  await q(`INSERT INTO guides (id, slug, category, hero_id, published_at, _status) VALUES (21, 'mythic-plus-basics', 'mythic-plus', 11, now(), 'published'), (22, 'raid-draft', 'raid', NULL, NULL, 'draft')`);
  await q(`INSERT INTO guides_locales (title, summary, content, _locale, _parent_id) VALUES
    ('Mythic+ basics', 'Summary', $1, 'en', 21), ('Основы М+', 'Кратко', $1, 'ru', 21), ('Raid draft', 'S', $1, 'en', 22)`, [lex("legacy")]);
  await q(`INSERT INTO _guides_v (id, parent_id, version_slug, version_category, version_hero_id, version__status, latest) VALUES
    (31, 21, 'mythic-plus-basics', 'mythic-plus', 11, 'draft', false), (32, 21, 'mythic-plus-basics', 'mythic-plus', 11, 'published', true), (33, 22, 'raid-draft', 'raid', NULL, 'draft', true)`);
  await q(`INSERT INTO _guides_v_locales (version_title, version_summary, version_content, _locale, _parent_id) VALUES
    ('Mythic+ basics (draft)', 'Summary', $1, 'en', 31), ('Mythic+ basics', 'Summary', $1, 'en', 32), ('Основы М+', 'Кратко', $1, 'ru', 32), ('Raid draft', 'S', $1, 'en', 33)`, [lex("legacy")]);
  // Pages including the league-of-legends block page that must stay on Gildra.
  await q(`INSERT INTO pages (id, slug, game, path, layout, blocks, _status) VALUES
    (41, 'wow/home', 'wow', '/', 'default', '[{"type":"wow.hero"}]', 'published'),
    (42, 'league-of-legends/home', 'league-of-legends', '/', 'bare', '[{"type":"lol.hero"}]', 'published')`);
  await q(`INSERT INTO pages_locales (title, _locale, _parent_id) VALUES ('Home', 'en', 41), ('LoL home', 'en', 42)`);
  await q(`INSERT INTO _pages_v (id, parent_id, version_slug, version_game, version_blocks, version__status, latest) VALUES
    (51, 41, 'wow/home', 'wow', '[{"type":"wow.hero"}]', 'published', true), (52, 42, 'league-of-legends/home', 'league-of-legends', '[{"type":"lol.hero"}]', 'published', true)`);
  await q(`INSERT INTO _pages_v_locales (version_title, _locale, _parent_id) VALUES ('Home', 'en', 51), ('LoL home', 'en', 52)`);
  for (const table of ["admins", "media", "guides", "_guides_v", "pages", "_pages_v"]) {
    await q(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), (SELECT max(id) FROM "${table}"))`);
  }
}

async function indexDef(name: string): Promise<string | null> {
  const res = await q(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`, [name]);
  return res.rows[0]?.indexdef ?? null;
}

async function isNotNull(table: string, column: string): Promise<boolean> {
  const res = await q(`SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [table, column]);
  return res.rows[0]?.is_nullable === "NO";
}

beforeAll(async () => {
  ({ payload, url } = await bootPayload("migration", "legacy"));
  await insertLegacyFixtures();
  legacyCounts = Object.fromEntries(await Promise.all(LEGACY_TABLES.map(async (t) => [t, await count(t)] as const)));
  legacyIDs = Object.fromEntries(await Promise.all(["admins", "media", "guides", "_guides_v", "pages", "_pages_v"].map(async (t) => [t, await ids(t)] as const)));
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("upgrade from the production schema", () => {
  it("applies the shared CMS migration on top of legacy data", async () => {
    await payload.db.migrate({ migrations });
    const ran = (await q(`SELECT name FROM payload_migrations WHERE name <> 'dev' ORDER BY id`)).rows.map((r) => r.name);
    expect(ran).toEqual(migrations.map((m) => m.name));
  });

  it("keeps every legacy row, ID and credential", async () => {
    for (const table of LEGACY_TABLES) expect(await count(table), table).toBe(legacyCounts[table]);
    for (const [table, list] of Object.entries(legacyIDs)) expect(await ids(table), table).toEqual(list);
    const admin = (await q(`SELECT email, salt, hash, platform_role FROM admins WHERE id = 7`)).rows[0];
    expect(admin).toEqual({ email: "legacy@test.local", salt: "legacy-salt", hash: LEGACY_HASH, platform_role: "owner" });
    expect((await q(`SELECT count(*)::int AS n FROM admins WHERE platform_role <> 'owner'`)).rows[0].n).toBe(0);
  });

  it("assigns all legacy documents and versions to Gildra and keeps page identity", async () => {
    const sites = (await q(`SELECT id, slug FROM sites ORDER BY slug`)).rows;
    expect(sites.map((s) => s.slug)).toEqual(["gildra", "riftden"]);
    const gildra = sites.find((s) => s.slug === "gildra")!.id;
    for (const [table, column] of [["guides", "site_id"], ["pages", "site_id"], ["media", "site_id"], ["_guides_v", "version_site_id"], ["_pages_v", "version_site_id"]]) {
      const rows = (await q(`SELECT DISTINCT ${column} AS s FROM "${table}"`)).rows.map((r) => r.s);
      expect(rows, table).toEqual([gildra]);
    }
    const lol = (await q(`SELECT slug, game, layout, blocks FROM pages WHERE id = 42`)).rows[0];
    expect(lol).toEqual({ slug: "league-of-legends/home", game: "league-of-legends", layout: "bare", blocks: [{ type: "lol.hero" }] });
  });

  it("has the expected constraints", async () => {
    expect(await indexDef("guides_slug_idx")).not.toMatch(/UNIQUE/);
    expect(await indexDef("pages_slug_idx")).not.toMatch(/UNIQUE/);
    expect(await indexDef("site_slug_1_idx")).toMatch(/UNIQUE INDEX .* ON public\.guides USING btree \(site_id, slug\)/);
    expect(await indexDef("site_slug_idx")).toMatch(/UNIQUE INDEX .* ON public\.pages USING btree \(site_id, slug\)/);
    expect(await indexDef("version_site_version_slug_1_idx")).not.toMatch(/UNIQUE/);
    for (const table of ["guides", "pages", "media", "categories", "tags", "site_settings"]) expect(await isNotNull(table, "site_id"), table).toBe(true);
    expect(await isNotNull("_guides_v", "version_site_id")).toBe(false);
  });

  it("serves legacy content through Payload: published reads, versions and site", async () => {
    const anon = await payload.find({ collection: "guides", overrideAccess: false, locale: "ru", depth: 0 });
    expect(anon.docs.map((d) => d.id)).toEqual([21]);
    expect(anon.docs[0].title).toBe("Основы М+");
    expect(anon.docs[0].hero).toBe(11);
    const versions = await payload.findVersions({ collection: "guides", where: { parent: { equals: 21 } }, overrideAccess: true, depth: 0 });
    expect(versions.totalDocs).toBe(2);
    const media = await payload.findByID({ collection: "media", id: 11, overrideAccess: true, locale: "ru" });
    expect(media.alt).toBe("Герой");
    const page = await payload.find({ collection: "pages", where: { slug: { equals: "wow/home" } }, overrideAccess: false });
    expect(page.docs[0]?.blocks).toEqual([{ type: "wow.hero" }]);
  });
});

describe("rollback", () => {
  it("restores the previous schema without losing legacy rows", async () => {
    const down = await cli("migrate:down");
    expect(down.ok, down.output.split("\n").filter((l) => /error|detail|hint|cause|code/i.test(l)).slice(0, 30).join("\n")).toBe(true);
    expect((await q(`SELECT to_regclass('public.sites') AS t`)).rows[0].t).toBeNull();
    expect(await indexDef("guides_slug_idx")).toMatch(/UNIQUE/);
    expect(await indexDef("pages_slug_idx")).toMatch(/UNIQUE/);
    for (const table of LEGACY_TABLES) expect(await count(table), table).toBe(legacyCounts[table]);
    expect((await q(`SELECT hash FROM admins WHERE id = 7`)).rows[0].hash).toBe(LEGACY_HASH);
    const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'guides' ORDER BY column_name`)).rows.map((r) => r.column_name);
    expect(cols).toEqual(["_status", "category", "created_at", "hero_id", "id", "published_at", "slug", "updated_at"]);
  });

  it("re-applies cleanly after a rollback", async () => {
    const up = await cli("migrate");
    expect(up.ok, up.output.slice(-2000)).toBe(true);
    expect(await count("sites")).toBe(2);
    expect((await q(`SELECT count(*)::int AS n FROM guides WHERE site_id IS NULL`)).rows[0].n).toBe(0);
  });

  it("treats the seeded, untouched state as safe to roll back", async () => {
    await seedSites(payload);
    expect(await count("site_settings")).toBe(2);
    expect(await blockers()).toEqual([]);
  });

  it("refuses when site settings were customised, and allows again once reverted", async () => {
    const gildra = (await q(`SELECT id FROM sites WHERE slug = 'gildra'`)).rows[0].id;
    await payload.update({ collection: "site-settings", where: { site: { equals: gildra } }, data: { tagline: "Custom" }, locale: "ru", overrideAccess: true });
    expect(await blockers()).toContain("site settings beyond the seeded defaults");
    const down = await cli("migrate:down");
    expect(down.ok).toBe(false);
    expect(down.output).toMatch(/Refusing to roll back .*site settings beyond the seeded defaults: 1/);
    expect(await count("site_settings")).toBe(2);

    await payload.update({ collection: "site-settings", where: { site: { equals: gildra } }, data: { tagline: null }, locale: "ru", overrideAccess: true });
    await q("DELETE FROM payload_jobs"); // the settings change queued a cache invalidation
    expect(await blockers()).toEqual([]);
  });

  it("refuses when new metadata exists only in a draft version", async () => {
    await payload.update({ collection: "guides", id: 21, data: { gameContext: { patch: "11.2.5" } } as never, draft: true, overrideAccess: true });
    expect((await q(`SELECT game_context_patch FROM guides WHERE id = 21`)).rows[0].game_context_patch).toBeNull();
    expect(await blockers()).toEqual(["article versions with authors, game context or SEO"]);
    const down = await cli("migrate:down");
    expect(down.ok).toBe(false);
    expect(down.output).toMatch(/article versions with authors, game context or SEO: 1/);
    expect((await q(`SELECT to_regclass('public.site_settings') AS t`)).rows[0].t).not.toBeNull();
  });

  it("refuses for site configuration, staff roles, page SEO, text lists and new blocks", async () => {
    const cases: [string, string, string][] = [
      ["sites added or changed after the upgrade", `UPDATE sites SET registration_enabled = true WHERE slug = 'gildra'`, `UPDATE sites SET registration_enabled = false WHERE slug = 'gildra'`],
      ["sites added or changed after the upgrade", `UPDATE sites SET plausible_site_id = 'riftden.com' WHERE slug = 'gildra'`, `UPDATE sites SET plausible_site_id = 'gildra.net' WHERE slug = 'gildra'`],
      ["staff that are not platform owners", `UPDATE admins SET platform_role = 'staff' WHERE id = 9`, `UPDATE admins SET platform_role = 'owner' WHERE id = 9`],
      ["page SEO image or noIndex", `UPDATE _pages_v SET version_seo_no_index = true WHERE id = 51`, `UPDATE _pages_v SET version_seo_no_index = false WHERE id = 51`],
      ["article text lists (mentioned champions)", `INSERT INTO _guides_v_texts ("order", parent_id, path, text) VALUES (1, 33, 'version.gameContext.lolMentionedChampions', 'Ahri')`, `DELETE FROM _guides_v_texts`],
      [
        "rich text using the new callout/table blocks",
        `UPDATE _guides_v_locales SET version_content = jsonb_set(version_content, '{root,children}', (version_content->'root'->'children') || '[{"type":"block","version":2,"fields":{"blockType":"callout","body":"x"}}]'::jsonb) WHERE _parent_id = 33`,
        `UPDATE _guides_v_locales SET version_content = '${lex("legacy")}'::jsonb WHERE _parent_id = 33`,
      ],
    ];
    const baseline = await blockers();
    for (const [label, apply, revert] of cases) {
      await q(apply);
      expect(await blockers(), label).toContain(label);
      await q(revert);
      expect(await blockers(), `${label} reverted`).toEqual(baseline);
    }
  });

  it("refuses to roll back once data depends on the new schema", async () => {
    const riftden = (await q(`SELECT id FROM sites WHERE slug = 'riftden'`)).rows[0].id;
    await payload.create({
      collection: "guides",
      data: { site: riftden, slug: "mythic-plus-basics", title: "LoL", summary: "S", content: JSON.parse(lex("x")) } as never,
      overrideAccess: true,
    });
    const down = await cli("migrate:down");
    expect(down.ok).toBe(false);
    expect(down.output).toMatch(/Refusing to roll back .*content of sites other than Gildra: 1/);
    expect(await count("sites")).toBe(2);
    const ran = (await q(`SELECT name FROM payload_migrations WHERE name = $1`, [SHARED])).rows;
    expect(ran).toHaveLength(1);
  });
});
