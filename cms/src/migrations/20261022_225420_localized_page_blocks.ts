import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Page `blocks` become localized (one block list per language), so publishing
 * English blocks no longer replaces the Russian page.
 *
 * up:   adds `pages_locales.blocks` / `_pages_v_locales.version_blocks`, copies
 *       the current shared value of every page and version into both `en` and
 *       `ru` (creating the missing locale row, which then holds only blocks),
 *       and drops the shared columns.
 * down: refuses (and changes nothing) while any page or version has different
 *       blocks per language, because one shared value cannot hold both
 *       (`ROLLBACK_CHECKS`). Otherwise it restores the shared columns from the
 *       locale rows and deletes the locale rows that `up` created (rows that
 *       hold nothing but blocks).
 */

/** [label, SQL returning `n`]; any n > 0 blocks `down`. Exported for tests. */
export const ROLLBACK_CHECKS: [string, string][] = [
  [
    'pages with different blocks per language',
    `SELECT count(*) AS n FROM pages p WHERE
       (SELECT blocks FROM pages_locales WHERE _parent_id = p.id AND _locale = 'en') IS DISTINCT FROM
       (SELECT blocks FROM pages_locales WHERE _parent_id = p.id AND _locale = 'ru')`,
  ],
  [
    'page versions with different blocks per language',
    `SELECT count(*) AS n FROM _pages_v v WHERE
       (SELECT version_blocks FROM _pages_v_locales WHERE _parent_id = v.id AND _locale = 'en') IS DISTINCT FROM
       (SELECT version_blocks FROM _pages_v_locales WHERE _parent_id = v.id AND _locale = 'ru')`,
  ],
]

export async function rollbackBlockers(db: MigrateDownArgs['db']): Promise<string[]> {
  const blockers: string[] = []
  for (const [label, query] of ROLLBACK_CHECKS) {
    const result = await db.execute(sql.raw(query))
    const n = Number(result.rows[0]?.n ?? 0)
    if (n > 0) blockers.push(`${label}: ${n}`)
  }
  return blockers
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "pages_locales" ADD COLUMN "blocks" jsonb;
  ALTER TABLE "_pages_v_locales" ADD COLUMN "version_blocks" jsonb;
  INSERT INTO "pages_locales" ("_locale", "_parent_id")
    SELECT l.code::"_locales", p.id FROM "pages" p CROSS JOIN (VALUES ('en'), ('ru')) AS l(code)
    WHERE p.blocks IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "pages_locales" x WHERE x._parent_id = p.id AND x._locale = l.code::"_locales");
  UPDATE "pages_locales" pl SET "blocks" = p.blocks FROM "pages" p WHERE p.id = pl._parent_id AND p.blocks IS NOT NULL;
  INSERT INTO "_pages_v_locales" ("_locale", "_parent_id")
    SELECT l.code::"_locales", v.id FROM "_pages_v" v CROSS JOIN (VALUES ('en'), ('ru')) AS l(code)
    WHERE v.version_blocks IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "_pages_v_locales" x WHERE x._parent_id = v.id AND x._locale = l.code::"_locales");
  UPDATE "_pages_v_locales" vl SET "version_blocks" = v.version_blocks FROM "_pages_v" v WHERE v.id = vl._parent_id AND v.version_blocks IS NOT NULL;
  ALTER TABLE "pages" DROP COLUMN "blocks";
  ALTER TABLE "_pages_v" DROP COLUMN "version_blocks";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const blockers = await rollbackBlockers(db)
  if (blockers.length > 0) {
    throw new Error(
      `Refusing to roll back 20261022_225420_localized_page_blocks; it would lose data (${blockers.join('; ')}). Make both languages equal or restore a backup instead.`,
    )
  }
  await db.execute(sql`
  ALTER TABLE "pages" ADD COLUMN "blocks" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_blocks" jsonb;
  UPDATE "pages" p SET "blocks" = (SELECT pl.blocks FROM "pages_locales" pl WHERE pl._parent_id = p.id AND pl.blocks IS NOT NULL LIMIT 1);
  UPDATE "_pages_v" v SET "version_blocks" = (SELECT vl.version_blocks FROM "_pages_v_locales" vl WHERE vl._parent_id = v.id AND vl.version_blocks IS NOT NULL LIMIT 1);
  DELETE FROM "pages_locales" WHERE "blocks" IS NOT NULL
    AND "title" IS NULL AND "summary" IS NULL AND "content" IS NULL AND "seo_title" IS NULL AND "seo_description" IS NULL;
  DELETE FROM "_pages_v_locales" WHERE "version_blocks" IS NOT NULL
    AND "version_title" IS NULL AND "version_summary" IS NULL AND "version_content" IS NULL AND "version_seo_title" IS NULL AND "version_seo_description" IS NULL;
  ALTER TABLE "pages_locales" DROP COLUMN "blocks";
  ALTER TABLE "_pages_v_locales" DROP COLUMN "version_blocks";`)
}
