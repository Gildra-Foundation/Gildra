import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Shared CMS (Gildra + Riftden). Generated DDL plus hand-written data steps:
 *
 * up:   1. additive schema (new tables, nullable columns, site+slug unique
 *          indexes replacing the global slug unique indexes);
 *       2. idempotent insert of the two sites;
 *       3. backfill: every existing guide/page/media document AND every
 *          version row belongs to the Gildra site (league-of-legends pages
 *          included); IDs, slugs, game/blocks values are untouched;
 *       4. every pre-existing admin becomes platform owner, so nobody silently
 *          loses the full access they had before roles existed;
 *       5. NOT NULL on site_id of site-scoped main tables.
 *
 * down: refuses (throws, changes nothing) when rolling back would lose data
 *       created on top of this schema: non-Gildra content, readers, taxonomy,
 *       values in the new article fields, or slugs that are no longer globally
 *       unique. Otherwise it restores the previous schema exactly.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sites_languages" AS ENUM('en', 'ru');
  CREATE TYPE "public"."enum_sites_game" AS ENUM('wow', 'lol');
  CREATE TYPE "public"."enum_sites_default_locale" AS ENUM('en', 'ru');
  CREATE TYPE "public"."enum_admins_sites_role" AS ENUM('admin', 'editor', 'author', 'analyst');
  CREATE TYPE "public"."enum_admins_platform_role" AS ENUM('owner', 'staff');
  CREATE TYPE "public"."enum_guides_game_context_wow_class" AS ENUM('death-knight', 'demon-hunter', 'druid', 'evoker', 'hunter', 'mage', 'monk', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior');
  CREATE TYPE "public"."enum_guides_game_context_lol_role" AS ENUM('top', 'jungle', 'mid', 'bottom', 'support');
  CREATE TYPE "public"."enum__guides_v_version_game_context_wow_class" AS ENUM('death-knight', 'demon-hunter', 'druid', 'evoker', 'hunter', 'mage', 'monk', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior');
  CREATE TYPE "public"."enum__guides_v_version_game_context_lol_role" AS ENUM('top', 'jungle', 'mid', 'bottom', 'support');
  CREATE TYPE "public"."enum_site_settings_social_platform" AS ENUM('discord', 'x', 'youtube', 'twitch', 'telegram', 'github');
  CREATE TYPE "public"."enum_members_memberships_status" AS ENUM('active', 'blocked');
  CREATE TYPE "public"."enum_member_profiles_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'revalidateSite', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'revalidateSite', 'schedulePublish');
  CREATE TABLE "sites_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sites_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );

  CREATE TABLE "sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"domain" varchar NOT NULL,
  	"game" "enum_sites_game" NOT NULL,
  	"default_locale" "enum_sites_default_locale" DEFAULT 'en' NOT NULL,
  	"public_url" varchar NOT NULL,
  	"plausible_site_id" varchar,
  	"revalidate_url" varchar,
  	"registration_enabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "admins_sites" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"site_id" integer NOT NULL,
  	"role" "enum_admins_sites_role" NOT NULL
  );

  CREATE TABLE "guides_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  CREATE TABLE "guides_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"tags_id" integer
  );

  CREATE TABLE "_guides_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );

  CREATE TABLE "_guides_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"categories_id" integer,
  	"tags_id" integer
  );

  CREATE TABLE "categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_id" integer NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "categories_locales" (
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );

  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_id" integer NOT NULL,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tags_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );

  CREATE TABLE "site_settings_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );

  CREATE TABLE "site_settings_navigation_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "site_settings_footer_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"href" varchar NOT NULL
  );

  CREATE TABLE "site_settings_footer_links_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );

  CREATE TABLE "site_settings_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_site_settings_social_platform" NOT NULL,
  	"url" varchar NOT NULL
  );

  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"site_id" integer NOT NULL,
  	"default_seo_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "site_settings_locales" (
  	"site_title" varchar NOT NULL,
  	"tagline" varchar,
  	"default_seo_title" varchar,
  	"default_seo_description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );

  CREATE TABLE "members_memberships" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"site_id" integer NOT NULL,
  	"status" "enum_members_memberships_status" DEFAULT 'active' NOT NULL,
  	"joined_at" timestamp(3) with time zone
  );

  CREATE TABLE "members_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"blocked" boolean DEFAULT false,
  	"blocked_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"_verified" boolean,
  	"_verificationtoken" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "member_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"member_id" integer NOT NULL,
  	"handle" varchar NOT NULL,
  	"display_name" varchar NOT NULL,
  	"bio" varchar,
  	"visibility" "enum_member_profiles_visibility" DEFAULT 'public' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "audit_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"action" varchar NOT NULL,
  	"actor_collection" varchar NOT NULL,
  	"actor_id" varchar,
  	"actor_email" varchar,
  	"target_collection" varchar NOT NULL,
  	"target_id" varchar NOT NULL,
  	"site_id" integer,
  	"changes" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );

  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"concurrency_key" varchar,
  	"site_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "pages_slug_idx";
  DROP INDEX "guides_slug_idx";
  ALTER TABLE "admins" ADD COLUMN "platform_role" "enum_admins_platform_role" DEFAULT 'staff' NOT NULL;
  ALTER TABLE "media" ADD COLUMN "site_id" integer;
  ALTER TABLE "media_locales" ADD COLUMN "caption" varchar;
  ALTER TABLE "pages" ADD COLUMN "site_id" integer;
  ALTER TABLE "pages" ADD COLUMN "seo_image_id" integer;
  ALTER TABLE "pages" ADD COLUMN "seo_no_index" boolean DEFAULT false;
  ALTER TABLE "pages_locales" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "pages_locales" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_seo_image_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_seo_no_index" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "_pages_v_locales" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "_pages_v_locales" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "guides" ADD COLUMN "site_id" integer;
  ALTER TABLE "guides" ADD COLUMN "author_id" integer;
  ALTER TABLE "guides" ADD COLUMN "game_context_patch" varchar;
  ALTER TABLE "guides" ADD COLUMN "game_context_season" varchar;
  ALTER TABLE "guides" ADD COLUMN "game_context_last_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "guides" ADD COLUMN "game_context_wow_class" "enum_guides_game_context_wow_class";
  ALTER TABLE "guides" ADD COLUMN "game_context_wow_spec" varchar;
  ALTER TABLE "guides" ADD COLUMN "game_context_wow_instance" varchar;
  ALTER TABLE "guides" ADD COLUMN "game_context_lol_champion" varchar;
  ALTER TABLE "guides" ADD COLUMN "game_context_lol_role" "enum_guides_game_context_lol_role";
  ALTER TABLE "guides" ADD COLUMN "seo_image_id" integer;
  ALTER TABLE "guides" ADD COLUMN "seo_no_index" boolean DEFAULT false;
  ALTER TABLE "guides_locales" ADD COLUMN "seo_title" varchar;
  ALTER TABLE "guides_locales" ADD COLUMN "seo_description" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "_guides_v" ADD COLUMN "version_author_id" integer;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_patch" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_season" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_last_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_wow_class" "enum__guides_v_version_game_context_wow_class";
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_wow_spec" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_wow_instance" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_lol_champion" varchar;
  ALTER TABLE "_guides_v" ADD COLUMN "version_game_context_lol_role" "enum__guides_v_version_game_context_lol_role";
  ALTER TABLE "_guides_v" ADD COLUMN "version_seo_image_id" integer;
  ALTER TABLE "_guides_v" ADD COLUMN "version_seo_no_index" boolean DEFAULT false;
  ALTER TABLE "_guides_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "_guides_v_locales" ADD COLUMN "version_seo_title" varchar;
  ALTER TABLE "_guides_v_locales" ADD COLUMN "version_seo_description" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sites_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "site_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_profiles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audit_log_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "sites_languages" ADD CONSTRAINT "sites_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admins_sites" ADD CONSTRAINT "admins_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admins_sites" ADD CONSTRAINT "admins_sites_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guides_texts" ADD CONSTRAINT "guides_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guides_rels" ADD CONSTRAINT "guides_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guides_rels" ADD CONSTRAINT "guides_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "guides_rels" ADD CONSTRAINT "guides_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_guides_v_texts" ADD CONSTRAINT "_guides_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_guides_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_guides_v_rels" ADD CONSTRAINT "_guides_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_guides_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_guides_v_rels" ADD CONSTRAINT "_guides_v_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_guides_v_rels" ADD CONSTRAINT "_guides_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories" ADD CONSTRAINT "categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_navigation" ADD CONSTRAINT "site_settings_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_navigation_locales" ADD CONSTRAINT "site_settings_navigation_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_footer_links" ADD CONSTRAINT "site_settings_footer_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_footer_links_locales" ADD CONSTRAINT "site_settings_footer_links_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings_footer_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_social" ADD CONSTRAINT "site_settings_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_default_seo_image_id_media_id_fk" FOREIGN KEY ("default_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "site_settings_locales" ADD CONSTRAINT "site_settings_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_memberships" ADD CONSTRAINT "members_memberships_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "members_memberships" ADD CONSTRAINT "members_memberships_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members_sessions" ADD CONSTRAINT "members_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_jobs" ADD CONSTRAINT "payload_jobs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "sites_languages_order_idx" ON "sites_languages" USING btree ("order");
  CREATE INDEX "sites_languages_parent_idx" ON "sites_languages" USING btree ("parent_id");
  CREATE UNIQUE INDEX "sites_slug_idx" ON "sites" USING btree ("slug");
  CREATE UNIQUE INDEX "sites_domain_idx" ON "sites" USING btree ("domain");
  CREATE INDEX "sites_updated_at_idx" ON "sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "sites" USING btree ("created_at");
  CREATE INDEX "admins_sites_order_idx" ON "admins_sites" USING btree ("_order");
  CREATE INDEX "admins_sites_parent_id_idx" ON "admins_sites" USING btree ("_parent_id");
  CREATE INDEX "admins_sites_site_idx" ON "admins_sites" USING btree ("site_id");
  CREATE INDEX "guides_texts_order_parent" ON "guides_texts" USING btree ("order","parent_id");
  CREATE INDEX "guides_rels_order_idx" ON "guides_rels" USING btree ("order");
  CREATE INDEX "guides_rels_parent_idx" ON "guides_rels" USING btree ("parent_id");
  CREATE INDEX "guides_rels_path_idx" ON "guides_rels" USING btree ("path");
  CREATE INDEX "guides_rels_categories_id_idx" ON "guides_rels" USING btree ("categories_id");
  CREATE INDEX "guides_rels_tags_id_idx" ON "guides_rels" USING btree ("tags_id");
  CREATE INDEX "_guides_v_texts_order_parent" ON "_guides_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_guides_v_rels_order_idx" ON "_guides_v_rels" USING btree ("order");
  CREATE INDEX "_guides_v_rels_parent_idx" ON "_guides_v_rels" USING btree ("parent_id");
  CREATE INDEX "_guides_v_rels_path_idx" ON "_guides_v_rels" USING btree ("path");
  CREATE INDEX "_guides_v_rels_categories_id_idx" ON "_guides_v_rels" USING btree ("categories_id");
  CREATE INDEX "_guides_v_rels_tags_id_idx" ON "_guides_v_rels" USING btree ("tags_id");
  CREATE INDEX "categories_site_idx" ON "categories" USING btree ("site_id");
  CREATE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");
  CREATE INDEX "categories_updated_at_idx" ON "categories" USING btree ("updated_at");
  CREATE INDEX "categories_created_at_idx" ON "categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_2_idx" ON "categories" USING btree ("site_id","slug");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tags_site_idx" ON "tags" USING btree ("site_id");
  CREATE INDEX "tags_slug_idx" ON "tags" USING btree ("slug");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_slug_3_idx" ON "tags" USING btree ("site_id","slug");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "site_settings_navigation_order_idx" ON "site_settings_navigation" USING btree ("_order");
  CREATE INDEX "site_settings_navigation_parent_id_idx" ON "site_settings_navigation" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "site_settings_navigation_locales_locale_parent_id_unique" ON "site_settings_navigation_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "site_settings_footer_links_order_idx" ON "site_settings_footer_links" USING btree ("_order");
  CREATE INDEX "site_settings_footer_links_parent_id_idx" ON "site_settings_footer_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "site_settings_footer_links_locales_locale_parent_id_unique" ON "site_settings_footer_links_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "site_settings_social_order_idx" ON "site_settings_social" USING btree ("_order");
  CREATE INDEX "site_settings_social_parent_id_idx" ON "site_settings_social" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "site_settings_site_idx" ON "site_settings" USING btree ("site_id");
  CREATE INDEX "site_settings_default_seo_default_seo_image_idx" ON "site_settings" USING btree ("default_seo_image_id");
  CREATE INDEX "site_settings_updated_at_idx" ON "site_settings" USING btree ("updated_at");
  CREATE INDEX "site_settings_created_at_idx" ON "site_settings" USING btree ("created_at");
  CREATE UNIQUE INDEX "site_settings_locales_locale_parent_id_unique" ON "site_settings_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "members_memberships_order_idx" ON "members_memberships" USING btree ("_order");
  CREATE INDEX "members_memberships_parent_id_idx" ON "members_memberships" USING btree ("_parent_id");
  CREATE INDEX "members_memberships_site_idx" ON "members_memberships" USING btree ("site_id");
  CREATE INDEX "members_sessions_order_idx" ON "members_sessions" USING btree ("_order");
  CREATE INDEX "members_sessions_parent_id_idx" ON "members_sessions" USING btree ("_parent_id");
  CREATE INDEX "members_blocked_idx" ON "members" USING btree ("blocked");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE UNIQUE INDEX "member_profiles_member_idx" ON "member_profiles" USING btree ("member_id");
  CREATE UNIQUE INDEX "member_profiles_handle_idx" ON "member_profiles" USING btree ("handle");
  CREATE INDEX "member_profiles_updated_at_idx" ON "member_profiles" USING btree ("updated_at");
  CREATE INDEX "member_profiles_created_at_idx" ON "member_profiles" USING btree ("created_at");
  CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");
  CREATE INDEX "audit_log_target_collection_idx" ON "audit_log" USING btree ("target_collection");
  CREATE INDEX "audit_log_target_id_idx" ON "audit_log" USING btree ("target_id");
  CREATE INDEX "audit_log_site_idx" ON "audit_log" USING btree ("site_id");
  CREATE INDEX "audit_log_updated_at_idx" ON "audit_log" USING btree ("updated_at");
  CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  CREATE INDEX "payload_jobs_site_idx" ON "payload_jobs" USING btree ("site_id");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guides" ADD CONSTRAINT "guides_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guides" ADD CONSTRAINT "guides_author_id_admins_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guides" ADD CONSTRAINT "guides_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_guides_v" ADD CONSTRAINT "_guides_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_guides_v" ADD CONSTRAINT "_guides_v_version_author_id_admins_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_guides_v" ADD CONSTRAINT "_guides_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_site_settings_fk" FOREIGN KEY ("site_settings_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_profiles_fk" FOREIGN KEY ("member_profiles_id") REFERENCES "public"."member_profiles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_log_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_site_idx" ON "media" USING btree ("site_id");
  CREATE INDEX "pages_site_idx" ON "pages" USING btree ("site_id");
  CREATE INDEX "pages_seo_seo_image_idx" ON "pages" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "site_slug_idx" ON "pages" USING btree ("site_id","slug");
  CREATE INDEX "_pages_v_version_version_site_idx" ON "_pages_v" USING btree ("version_site_id");
  CREATE INDEX "_pages_v_version_seo_version_seo_image_idx" ON "_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "version_site_version_slug_idx" ON "_pages_v" USING btree ("version_site_id","version_slug");
  CREATE INDEX "guides_site_idx" ON "guides" USING btree ("site_id");
  CREATE INDEX "guides_author_idx" ON "guides" USING btree ("author_id");
  CREATE INDEX "guides_seo_seo_image_idx" ON "guides" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "site_slug_1_idx" ON "guides" USING btree ("site_id","slug");
  CREATE INDEX "_guides_v_version_version_site_idx" ON "_guides_v" USING btree ("version_site_id");
  CREATE INDEX "_guides_v_version_version_author_idx" ON "_guides_v" USING btree ("version_author_id");
  CREATE INDEX "_guides_v_version_seo_version_seo_image_idx" ON "_guides_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_guides_v_autosave_idx" ON "_guides_v" USING btree ("autosave");
  CREATE INDEX "version_site_version_slug_1_idx" ON "_guides_v" USING btree ("version_site_id","version_slug");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("sites_id");
  CREATE INDEX "payload_locked_documents_rels_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("categories_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");
  CREATE INDEX "payload_locked_documents_rels_site_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("site_settings_id");
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_locked_documents_rels_member_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("member_profiles_id");
  CREATE INDEX "payload_locked_documents_rels_audit_log_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_log_id");
  CREATE INDEX "payload_preferences_rels_members_id_idx" ON "payload_preferences_rels" USING btree ("members_id");
  CREATE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "guides_slug_idx" ON "guides" USING btree ("slug");`)

  await db.execute(sql`
  INSERT INTO "sites" ("name", "slug", "domain", "game", "default_locale", "public_url", "plausible_site_id", "registration_enabled")
  VALUES
    ('Gildra', 'gildra', 'gildra.net', 'wow', 'en', 'https://gildra.net', 'gildra.net', false),
    ('Riftden', 'riftden', 'riftden.com', 'lol', 'en', 'https://riftden.com', 'riftden.com', false)
  ON CONFLICT ("slug") DO NOTHING;
  INSERT INTO "sites_languages" ("order", "parent_id", "value")
  SELECT l.ord, s.id, l.value::"enum_sites_languages"
  FROM "sites" s CROSS JOIN (VALUES (1, 'en'), (2, 'ru')) AS l(ord, value)
  WHERE s.slug IN ('gildra', 'riftden')
    AND NOT EXISTS (SELECT 1 FROM "sites_languages" x WHERE x.parent_id = s.id AND x.value::text = l.value);

  UPDATE "guides" SET "site_id" = (SELECT id FROM "sites" WHERE slug = 'gildra') WHERE "site_id" IS NULL;
  UPDATE "pages" SET "site_id" = (SELECT id FROM "sites" WHERE slug = 'gildra') WHERE "site_id" IS NULL;
  UPDATE "media" SET "site_id" = (SELECT id FROM "sites" WHERE slug = 'gildra') WHERE "site_id" IS NULL;
  UPDATE "_guides_v" SET "version_site_id" = (SELECT id FROM "sites" WHERE slug = 'gildra') WHERE "version_site_id" IS NULL;
  UPDATE "_pages_v" SET "version_site_id" = (SELECT id FROM "sites" WHERE slug = 'gildra') WHERE "version_site_id" IS NULL;

  UPDATE "admins" SET "platform_role" = 'owner';

  -- media: NOT NULL is part of the schema snapshot (site is required).
  -- guides/pages: drafts collections never get NOT NULL from the schema
  -- builder, so these two constraints are deliberately outside the snapshot.
  ALTER TABLE "guides" ALTER COLUMN "site_id" SET NOT NULL;
  ALTER TABLE "pages" ALTER COLUMN "site_id" SET NOT NULL;
  ALTER TABLE "media" ALTER COLUMN "site_id" SET NOT NULL;
`)
}



/**
 * Everything a rollback would silently lose or change in meaning. `down` runs
 * only when every count is zero, i.e. the database holds nothing beyond what
 * this migration (and the idempotent seed) created on top of legacy data.
 * Conservative by design: when in doubt, restore the pre-upgrade backup.
 * Exported for tests.
 */
export const ROLLBACK_CHECKS: [string, string][] = [
  // Tenancy
  ['content of sites other than Gildra', `SELECT (SELECT count(*) FROM guides g JOIN sites s ON s.id = g.site_id WHERE s.slug <> 'gildra') + (SELECT count(*) FROM pages p JOIN sites s ON s.id = p.site_id WHERE s.slug <> 'gildra') + (SELECT count(*) FROM media m JOIN sites s ON s.id = m.site_id WHERE s.slug <> 'gildra') AS n`],
  ['versions of sites other than Gildra', `SELECT (SELECT count(*) FROM _guides_v v JOIN sites s ON s.id = v.version_site_id WHERE s.slug <> 'gildra') + (SELECT count(*) FROM _pages_v v JOIN sites s ON s.id = v.version_site_id WHERE s.slug <> 'gildra') AS n`],
  ['sites added or changed after the upgrade', `SELECT count(*) AS n FROM sites s WHERE NOT (
      (s.slug = 'gildra' AND s.name = 'Gildra' AND s.domain = 'gildra.net' AND s.game = 'wow' AND s.public_url = 'https://gildra.net' AND s.plausible_site_id IS NOT DISTINCT FROM 'gildra.net')
   OR (s.slug = 'riftden' AND s.name = 'Riftden' AND s.domain = 'riftden.com' AND s.game = 'lol' AND s.public_url = 'https://riftden.com' AND s.plausible_site_id IS NOT DISTINCT FROM 'riftden.com'))
   OR s.default_locale <> 'en' OR s.revalidate_url IS NOT NULL OR s.registration_enabled IS TRUE
   OR (SELECT array_agg(l.value::text ORDER BY l.value::text) FROM sites_languages l WHERE l.parent_id = s.id) IS DISTINCT FROM ARRAY['en', 'ru']`],
  ['site settings beyond the seeded defaults', `SELECT (SELECT count(*) FROM site_settings WHERE default_seo_image_id IS NOT NULL)
    + (SELECT count(*) FROM site_settings_locales sl JOIN site_settings ss ON ss.id = sl._parent_id JOIN sites s ON s.id = ss.site_id
         WHERE sl.site_title IS DISTINCT FROM s.name OR sl.tagline IS NOT NULL OR sl.default_seo_title IS NOT NULL OR sl.default_seo_description IS NOT NULL)
    + (SELECT count(*) FROM site_settings_navigation) + (SELECT count(*) FROM site_settings_footer_links) + (SELECT count(*) FROM site_settings_social) AS n`],
  // Accounts and roles (rolling back would turn every staff member into a full admin)
  ['staff that are not platform owners', `SELECT count(*) AS n FROM admins WHERE platform_role <> 'owner'`],
  ['site role assignments', 'SELECT count(*) AS n FROM admins_sites'],
  ['reader accounts', 'SELECT count(*) AS n FROM members'],
  ['reader profiles', 'SELECT count(*) AS n FROM member_profiles'],
  // Taxonomy and new article/page/media fields — live rows and every version
  ['categories', 'SELECT count(*) AS n FROM categories'],
  ['tags', 'SELECT count(*) AS n FROM tags'],
  ['article category/tag links', 'SELECT (SELECT count(*) FROM guides_rels) + (SELECT count(*) FROM _guides_v_rels) AS n'],
  ['article text lists (mentioned champions)', 'SELECT (SELECT count(*) FROM guides_texts) + (SELECT count(*) FROM _guides_v_texts) AS n'],
  ['article authors, game context or SEO', `SELECT count(*) AS n FROM guides WHERE author_id IS NOT NULL OR seo_image_id IS NOT NULL OR seo_no_index IS TRUE OR game_context_patch IS NOT NULL OR game_context_season IS NOT NULL OR game_context_last_reviewed_at IS NOT NULL OR game_context_wow_class IS NOT NULL OR game_context_wow_spec IS NOT NULL OR game_context_wow_instance IS NOT NULL OR game_context_lol_champion IS NOT NULL OR game_context_lol_role IS NOT NULL`],
  ['article versions with authors, game context or SEO', `SELECT count(*) AS n FROM _guides_v WHERE version_author_id IS NOT NULL OR version_seo_image_id IS NOT NULL OR version_seo_no_index IS TRUE OR version_game_context_patch IS NOT NULL OR version_game_context_season IS NOT NULL OR version_game_context_last_reviewed_at IS NOT NULL OR version_game_context_wow_class IS NOT NULL OR version_game_context_wow_spec IS NOT NULL OR version_game_context_wow_instance IS NOT NULL OR version_game_context_lol_champion IS NOT NULL OR version_game_context_lol_role IS NOT NULL`],
  ['page SEO image or noIndex', `SELECT (SELECT count(*) FROM pages WHERE seo_image_id IS NOT NULL OR seo_no_index IS TRUE) + (SELECT count(*) FROM _pages_v WHERE version_seo_image_id IS NOT NULL OR version_seo_no_index IS TRUE) AS n`],
  ['localized SEO texts or media captions', `SELECT (SELECT count(*) FROM guides_locales WHERE seo_title IS NOT NULL OR seo_description IS NOT NULL)
    + (SELECT count(*) FROM _guides_v_locales WHERE version_seo_title IS NOT NULL OR version_seo_description IS NOT NULL)
    + (SELECT count(*) FROM pages_locales WHERE seo_title IS NOT NULL OR seo_description IS NOT NULL)
    + (SELECT count(*) FROM _pages_v_locales WHERE version_seo_title IS NOT NULL OR version_seo_description IS NOT NULL)
    + (SELECT count(*) FROM media_locales WHERE caption IS NOT NULL) AS n`],
  ['rich text using the new callout/table blocks', `SELECT (SELECT count(*) FROM guides_locales WHERE jsonb_path_exists(content, '$.** ? (@.type == "block")'))
    + (SELECT count(*) FROM _guides_v_locales WHERE jsonb_path_exists(version_content, '$.** ? (@.type == "block")'))
    + (SELECT count(*) FROM pages_locales WHERE jsonb_path_exists(content, '$.** ? (@.type == "block")'))
    + (SELECT count(*) FROM _pages_v_locales WHERE jsonb_path_exists(version_content, '$.** ? (@.type == "block")')) AS n`],
  // Operations
  ['queued or failed jobs (scheduled publications, cache invalidation)', 'SELECT count(*) AS n FROM payload_jobs'],
  ['audit log entries', 'SELECT count(*) AS n FROM audit_log'],
  // Legacy constraints that down restores
  ['duplicate guide slugs', 'SELECT count(*) AS n FROM (SELECT slug FROM guides GROUP BY slug HAVING count(*) > 1) d'],
  ['duplicate page slugs', 'SELECT count(*) AS n FROM (SELECT slug FROM pages GROUP BY slug HAVING count(*) > 1) d'],
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

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  const blockers = await rollbackBlockers(db)
  if (blockers.length > 0) {
    throw new Error(
      `Refusing to roll back 20261008_174758_shared_cms; it would lose data (${blockers.join('; ')}). Restore a backup instead.`,
    )
  }
  // Generated by drizzle, except IF EXISTS on constraints/indexes: dropping the
  // new tables with CASCADE already removes the foreign keys that point at them.
  await db.execute(sql`
   ALTER TABLE "sites_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admins_sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "guides_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "guides_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_guides_v_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_guides_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "categories_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_navigation_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_footer_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_footer_links_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_memberships" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sites_languages" CASCADE;
  DROP TABLE "sites" CASCADE;
  DROP TABLE "admins_sites" CASCADE;
  DROP TABLE "guides_texts" CASCADE;
  DROP TABLE "guides_rels" CASCADE;
  DROP TABLE "_guides_v_texts" CASCADE;
  DROP TABLE "_guides_v_rels" CASCADE;
  DROP TABLE "categories" CASCADE;
  DROP TABLE "categories_locales" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  DROP TABLE "site_settings_navigation" CASCADE;
  DROP TABLE "site_settings_navigation_locales" CASCADE;
  DROP TABLE "site_settings_footer_links" CASCADE;
  DROP TABLE "site_settings_footer_links_locales" CASCADE;
  DROP TABLE "site_settings_social" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "site_settings_locales" CASCADE;
  DROP TABLE "members_memberships" CASCADE;
  DROP TABLE "members_sessions" CASCADE;
  DROP TABLE "members" CASCADE;
  DROP TABLE "member_profiles" CASCADE;
  DROP TABLE "audit_log" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "media_site_id_sites_id_fk";

  ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_site_id_sites_id_fk";

  ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_seo_image_id_media_id_fk";

  ALTER TABLE "_pages_v" DROP CONSTRAINT IF EXISTS "_pages_v_version_site_id_sites_id_fk";

  ALTER TABLE "_pages_v" DROP CONSTRAINT IF EXISTS "_pages_v_version_seo_image_id_media_id_fk";

  ALTER TABLE "guides" DROP CONSTRAINT IF EXISTS "guides_site_id_sites_id_fk";

  ALTER TABLE "guides" DROP CONSTRAINT IF EXISTS "guides_author_id_admins_id_fk";

  ALTER TABLE "guides" DROP CONSTRAINT IF EXISTS "guides_seo_image_id_media_id_fk";

  ALTER TABLE "_guides_v" DROP CONSTRAINT IF EXISTS "_guides_v_version_site_id_sites_id_fk";

  ALTER TABLE "_guides_v" DROP CONSTRAINT IF EXISTS "_guides_v_version_author_id_admins_id_fk";

  ALTER TABLE "_guides_v" DROP CONSTRAINT IF EXISTS "_guides_v_version_seo_image_id_media_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sites_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_categories_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_tags_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_site_settings_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_members_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_member_profiles_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_audit_log_fk";

  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_members_fk";

  DROP INDEX IF EXISTS "media_site_idx";
  DROP INDEX IF EXISTS "pages_site_idx";
  DROP INDEX IF EXISTS "pages_seo_seo_image_idx";
  DROP INDEX IF EXISTS "site_slug_idx";
  DROP INDEX IF EXISTS "_pages_v_version_version_site_idx";
  DROP INDEX IF EXISTS "_pages_v_version_seo_version_seo_image_idx";
  DROP INDEX IF EXISTS "_pages_v_autosave_idx";
  DROP INDEX IF EXISTS "version_site_version_slug_idx";
  DROP INDEX IF EXISTS "guides_site_idx";
  DROP INDEX IF EXISTS "guides_author_idx";
  DROP INDEX IF EXISTS "guides_seo_seo_image_idx";
  DROP INDEX IF EXISTS "site_slug_1_idx";
  DROP INDEX IF EXISTS "_guides_v_version_version_site_idx";
  DROP INDEX IF EXISTS "_guides_v_version_version_author_idx";
  DROP INDEX IF EXISTS "_guides_v_version_seo_version_seo_image_idx";
  DROP INDEX IF EXISTS "_guides_v_autosave_idx";
  DROP INDEX IF EXISTS "version_site_version_slug_1_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sites_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_categories_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_tags_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_site_settings_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_members_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_member_profiles_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_audit_log_id_idx";
  DROP INDEX IF EXISTS "payload_preferences_rels_members_id_idx";
  DROP INDEX IF EXISTS "pages_slug_idx";
  DROP INDEX IF EXISTS "guides_slug_idx";
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE UNIQUE INDEX "guides_slug_idx" ON "guides" USING btree ("slug");
  ALTER TABLE "admins" DROP COLUMN "platform_role";
  ALTER TABLE "media" DROP COLUMN "site_id";
  ALTER TABLE "media_locales" DROP COLUMN "caption";
  ALTER TABLE "pages" DROP COLUMN "site_id";
  ALTER TABLE "pages" DROP COLUMN "seo_image_id";
  ALTER TABLE "pages" DROP COLUMN "seo_no_index";
  ALTER TABLE "pages_locales" DROP COLUMN "seo_title";
  ALTER TABLE "pages_locales" DROP COLUMN "seo_description";
  ALTER TABLE "_pages_v" DROP COLUMN "version_site_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_seo_image_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_seo_no_index";
  ALTER TABLE "_pages_v" DROP COLUMN "autosave";
  ALTER TABLE "_pages_v_locales" DROP COLUMN "version_seo_title";
  ALTER TABLE "_pages_v_locales" DROP COLUMN "version_seo_description";
  ALTER TABLE "guides" DROP COLUMN "site_id";
  ALTER TABLE "guides" DROP COLUMN "author_id";
  ALTER TABLE "guides" DROP COLUMN "game_context_patch";
  ALTER TABLE "guides" DROP COLUMN "game_context_season";
  ALTER TABLE "guides" DROP COLUMN "game_context_last_reviewed_at";
  ALTER TABLE "guides" DROP COLUMN "game_context_wow_class";
  ALTER TABLE "guides" DROP COLUMN "game_context_wow_spec";
  ALTER TABLE "guides" DROP COLUMN "game_context_wow_instance";
  ALTER TABLE "guides" DROP COLUMN "game_context_lol_champion";
  ALTER TABLE "guides" DROP COLUMN "game_context_lol_role";
  ALTER TABLE "guides" DROP COLUMN "seo_image_id";
  ALTER TABLE "guides" DROP COLUMN "seo_no_index";
  ALTER TABLE "guides_locales" DROP COLUMN "seo_title";
  ALTER TABLE "guides_locales" DROP COLUMN "seo_description";
  ALTER TABLE "_guides_v" DROP COLUMN "version_site_id";
  ALTER TABLE "_guides_v" DROP COLUMN "version_author_id";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_patch";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_season";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_last_reviewed_at";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_wow_class";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_wow_spec";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_wow_instance";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_lol_champion";
  ALTER TABLE "_guides_v" DROP COLUMN "version_game_context_lol_role";
  ALTER TABLE "_guides_v" DROP COLUMN "version_seo_image_id";
  ALTER TABLE "_guides_v" DROP COLUMN "version_seo_no_index";
  ALTER TABLE "_guides_v" DROP COLUMN "autosave";
  ALTER TABLE "_guides_v_locales" DROP COLUMN "version_seo_title";
  ALTER TABLE "_guides_v_locales" DROP COLUMN "version_seo_description";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sites_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tags_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "site_settings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_profiles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audit_log_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "members_id";
  DROP TYPE "public"."enum_sites_languages";
  DROP TYPE "public"."enum_sites_game";
  DROP TYPE "public"."enum_sites_default_locale";
  DROP TYPE "public"."enum_admins_sites_role";
  DROP TYPE "public"."enum_admins_platform_role";
  DROP TYPE "public"."enum_guides_game_context_wow_class";
  DROP TYPE "public"."enum_guides_game_context_lol_role";
  DROP TYPE "public"."enum__guides_v_version_game_context_wow_class";
  DROP TYPE "public"."enum__guides_v_version_game_context_lol_role";
  DROP TYPE "public"."enum_site_settings_social_platform";
  DROP TYPE "public"."enum_members_memberships_status";
  DROP TYPE "public"."enum_member_profiles_visibility";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";`)
}
