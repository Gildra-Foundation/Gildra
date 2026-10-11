import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Required by the Payload 3.90 security upgrade (no product schema change):
 * every auth collection gets `reset_password_requested_at`, which Payload's
 * forgot-password operation uses to throttle reset requests. Nullable, no
 * backfill. `down` only drops these timestamps.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "members" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "admins" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "members" DROP COLUMN "reset_password_requested_at";`)
}
