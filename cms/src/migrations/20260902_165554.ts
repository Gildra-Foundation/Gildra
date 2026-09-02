import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_game" AS ENUM('wow', 'league-of-legends');
  CREATE TYPE "public"."enum_pages_layout" AS ENUM('default', 'bare');
  CREATE TYPE "public"."enum__pages_v_version_game" AS ENUM('wow', 'league-of-legends');
  CREATE TYPE "public"."enum__pages_v_version_layout" AS ENUM('default', 'bare');
  ALTER TABLE "pages" ADD COLUMN "game" "enum_pages_game" DEFAULT 'wow';
  ALTER TABLE "pages" ADD COLUMN "path" varchar;
  ALTER TABLE "pages" ADD COLUMN "layout" "enum_pages_layout" DEFAULT 'default';
  ALTER TABLE "pages" ADD COLUMN "blocks" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_game" "enum__pages_v_version_game" DEFAULT 'wow';
  ALTER TABLE "_pages_v" ADD COLUMN "version_path" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_layout" "enum__pages_v_version_layout" DEFAULT 'default';
  ALTER TABLE "_pages_v" ADD COLUMN "version_blocks" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "game";
  ALTER TABLE "pages" DROP COLUMN "path";
  ALTER TABLE "pages" DROP COLUMN "layout";
  ALTER TABLE "pages" DROP COLUMN "blocks";
  ALTER TABLE "_pages_v" DROP COLUMN "version_game";
  ALTER TABLE "_pages_v" DROP COLUMN "version_path";
  ALTER TABLE "_pages_v" DROP COLUMN "version_layout";
  ALTER TABLE "_pages_v" DROP COLUMN "version_blocks";
  DROP TYPE "public"."enum_pages_game";
  DROP TYPE "public"."enum_pages_layout";
  DROP TYPE "public"."enum__pages_v_version_game";
  DROP TYPE "public"."enum__pages_v_version_layout";`)
}
