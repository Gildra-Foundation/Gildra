import { Gutter, Link } from "@payloadcms/ui";
import type { Payload, TypedUser, VisibleEntities } from "payload";
import React from "react";

import { adminLang, adminText } from "../admin/text";
import { plausibleEnv } from "../analytics/plausible";
import {
  ANALYTICS_ROLES,
  asStaff,
  hasSiteRole,
  type ID,
  isOwner,
  PUBLISH_ROLES,
  relationID,
  roleOnSite,
  SITE_ROLES,
  siteIDsWithRole,
  WRITE_ROLES,
} from "../access/roles";
import { SiteLink } from "./SiteLink";

import { AdminSurface } from "./AdminSurface";
import { RecentEditsTable } from "./RecentEditsTable";
import { UpcomingTable } from "./UpcomingTable";
import { StatsCard } from "./valyro-ui/data-display/StatsCard";
import { EmptyState } from "./valyro-ui/data-display/EmptyState";
import { Badge } from "./valyro-ui/basic/Badge";

const STALE_DAYS = 90;
const RECENT_LIMIT = 8;
const UPCOMING_LIMIT = 6;

const GAME_LABEL: Record<string, string> = { wow: "World of Warcraft", lol: "League of Legends" };

type Props = {
  payload: Payload;
  user?: TypedUser | null;
  i18n: { language: string };
  locale?: { code?: string } | null;
  visibleEntities?: VisibleEntities;
};

type SiteRow = {
  id: ID;
  name: string;
  domain: string;
  game: string;
  publicUrl?: string | null;
  plausibleSiteId?: string | null;
  registrationEnabled?: boolean | null;
  defaultLocale?: string | null;
};

type Counts = { published: number; drafts: number; scheduled: number; stale: number; readers: number | null };

/** `titleLocale`: the content language the title was found in; links open the editor there. */
type RecentItem = {
  collection: "guides" | "pages";
  id: ID;
  title: string;
  titleLocale: string;
  site: ID | null;
  status: string;
  updatedAt: string;
};

type UpcomingItem = {
  id: ID;
  when: string;
  action: "publish" | "unpublish";
  collection: string;
  docID: ID | null;
  title: string;
  titleLocale: string;
  site: ID | null;
};

/**
 * /admin home: one card per site the viewer works on (counters, quick actions,
 * readers, analytics state), the latest edits and the publishing schedule.
 * Every query runs with the viewer's own access, so nobody sees another site's
 * numbers; the jobs queue is filtered by publishing role like its own access.
 */
export async function Dashboard({ payload, user, i18n, locale, visibleEntities }: Props) {
  const lang = adminLang(i18n?.language);
  const t = adminText(lang);
  const staff = asStaff(user);
  if (!staff) return null;
  const owner = isOwner(staff);
  const contentLocale = locale?.code ?? "en";
  const plausible = plausibleEnv();
  const statsServer = Boolean(plausible.url && plausible.apiKey);
  const mySiteIDs = owner ? null : siteIDsWithRole(staff, SITE_ROLES).map(String);

  const { docs } = await payload.find({ collection: "sites", depth: 0, pagination: false, overrideAccess: true, sort: "name" });
  const sites = (docs as unknown as SiteRow[]).filter((s) => !mySiteIDs || mySiteIDs.includes(String(s.id)));

  const [counts, recent, upcoming] = await Promise.all([
    Promise.all(sites.map((site) => siteCounts(payload, user, site))),
    recentEdits(payload, user, contentLocale),
    upcomingJobs(payload, user, owner, contentLocale),
  ]);
  const siteName = new Map(sites.map((s) => [String(s.id), s.name]));
  const roleLabel = (site: ID) => {
    if (owner) return t.roleOwner;
    const role = roleOnSite(staff, site);
    return role ? t[`role${role[0].toUpperCase()}${role.slice(1)}` as "roleAdmin"] : "—";
  };
  const visible = new Set(visibleEntities?.collections ?? []);

  return (
    <AdminSurface lang={lang}>
    <Gutter className="dashboard gd-home">
      <header className="gd-home__head">
        <h1>{t.greeting}</h1>
        <p>{t.greetingHint}</p>
      </header>

      {sites.length === 0 ? (
        <EmptyState title={t.noSites} role="status" />
      ) : (
        <div className="gd-sites">
          {sites.map((site, index) => {
            const c = counts[index];
            const id = String(site.id);
            const canWrite = hasSiteRole(staff, site.id, WRITE_ROLES);
            const canPublish = hasSiteRole(staff, site.id, PUBLISH_ROLES);
            const canAnalyse = hasSiteRole(staff, site.id, ANALYTICS_ROLES);
            const canSettings = hasSiteRole(staff, site.id, ["admin"]);
            return (
              <section key={id} className={`gd-site gd-site--${site.game}`} aria-labelledby={`gd-site-${id}`}>
                <div className="gd-site__top">
                  <div>
                    <p className="gd-site__game">{GAME_LABEL[site.game] ?? site.game}</p>
                    <h2 id={`gd-site-${id}`}>{site.name}</h2>
                    <p className="gd-site__role">
                      {t.yourRole}: {roleLabel(site.id)}
                    </p>
                  </div>
                  {site.publicUrl ? (
                    <a className="gd-site__open" href={site.publicUrl} target="_blank" rel="noreferrer">
                      {site.domain} ↗
                    </a>
                  ) : null}
                </div>

                <div className="gd-site__stats">
                  <StatsCard label={t.published} value={c.published} locale={lang} />
                  <StatsCard label={t.drafts} value={c.drafts} locale={lang} />
                  <StatsCard label={t.scheduled} value={c.scheduled} locale={lang} />
                  <StatsCard label={t.stale} value={c.stale} locale={lang} className={c.stale > 0 ? "gd-stat--warn" : undefined} />
                </div>

                <p className="gd-site__meta">
                  {c.readers !== null ? (
                    <span>
                      {t.readers}: <strong>{c.readers}</strong>
                    </span>
                  ) : null}
                  <Badge color="gray">{site.registrationEnabled ? t.registrationOpen : t.registrationClosed}</Badge>
                  <Badge color={statsServer && site.plausibleSiteId ? "green" : "gray"}>
                    {statsServer && site.plausibleSiteId ? t.statsConnected : t.statsMissing}
                  </Badge>
                </p>

                <div className="gd-site__actions">
                  {canWrite ? (
                    <SiteLink
                      siteID={id}
                      href={`/admin/collections/guides/create?locale=${site.defaultLocale ?? "en"}`}
                      variant="accent"
                    >
                      + {t.newArticle}
                    </SiteLink>
                  ) : null}
                  <SiteLink siteID={id} href="/admin/collections/guides" variant="secondary">
                    {t.allArticles}
                  </SiteLink>
                  {canPublish ? (
                    <SiteLink siteID={id} href="/admin/collections/pages" variant="secondary">
                      {t.pages}
                    </SiteLink>
                  ) : null}
                  {canWrite ? (
                    <SiteLink siteID={id} href="/admin/collections/media" variant="secondary">
                      {t.media}
                    </SiteLink>
                  ) : null}
                  {canSettings ? (
                    <SiteLink siteID={id} href="/admin/collections/site-settings" variant="secondary">
                      {t.settings}
                    </SiteLink>
                  ) : null}
                  {canAnalyse ? (
                    <SiteLink siteID={id} href="/admin/analytics" variant="secondary">
                      {t.analytics}
                    </SiteLink>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="gd-columns">
        <section className="gd-panel" aria-labelledby="gd-recent">
          <h2 id="gd-recent">{t.recent}</h2>
          <RecentEditsTable lang={lang} rows={recent.map((item) => ({
            id: `${item.collection}-${item.id}`, title: item.title, kind: item.collection,
            href: `/admin/collections/${item.collection}/${item.id}?locale=${item.titleLocale}`,
            siteID: item.site === null ? null : String(item.site),
            siteName: item.site !== null ? (siteName.get(String(item.site)) ?? "—") : "—",
            status: item.status, updatedAt: item.updatedAt,
          }))} />
        </section>

        <section className="gd-panel" aria-labelledby="gd-upcoming">
          <h2 id="gd-upcoming">{t.upcoming}</h2>
          {upcoming.length === 0 ? (
            <EmptyState size="sm" title={t.upcomingEmpty} />
          ) : (
            <UpcomingTable lang={lang} rows={upcoming.map((job) => ({
              id: String(job.id), when: job.when, title: job.title, action: job.action,
              href: job.docID !== null ? `/admin/collections/${job.collection}/${job.docID}?locale=${job.titleLocale}` : null,
              siteID: job.site === null ? null : String(job.site),
              siteName: job.site !== null ? (siteName.get(String(job.site)) ?? "") : "",
            }))} />
          )}
        </section>
      </div>

      <nav className="gd-sections" aria-label={t.sections}>
        {(
          [
            ["admins", t.staff],
            ["members", t.readerAccounts],
            ["categories", t.categories],
            ["tags", t.tags],
            ["sites", t.sites],
            ["audit-log", t.audit],
          ] as const
        )
          .filter(([slug]) => visible.has(slug))
          .map(([slug, label]) => (
            <Link key={slug} href={`/admin/collections/${slug}`} prefetch={false} className="gd-chip">
              {label}
            </Link>
          ))}
      </nav>
    </Gutter>
    </AdminSurface>
  );
}

async function siteCounts(payload: Payload, user: TypedUser | null | undefined, site: SiteRow): Promise<Counts> {
  const staleBefore = new Date(Date.now() - STALE_DAYS * 24 * 3600 * 1000).toISOString();
  const count = (where: Record<string, unknown>) =>
    payload.count({ collection: "guides", where: where as never, overrideAccess: false, user }).then((r) => r.totalDocs);
  const onSite = { site: { equals: site.id } };
  const canSeeQueue = hasSiteRole(user, site.id, PUBLISH_ROLES);
  const [published, drafts, stale, scheduled, readers] = await Promise.all([
    count({ and: [onSite, { _status: { equals: "published" } }] }),
    count({ and: [onSite, { _status: { equals: "draft" } }] }),
    count({
      and: [
        onSite,
        { _status: { equals: "published" } },
        // Never reviewed: count the age from the publication date; with neither date the age is unknown, so it counts.
        {
          or: [
            { "gameContext.lastReviewedAt": { less_than: staleBefore } },
            { and: [{ "gameContext.lastReviewedAt": { exists: false } }, { publishedAt: { less_than: staleBefore } }] },
            { and: [{ "gameContext.lastReviewedAt": { exists: false } }, { publishedAt: { exists: false } }] },
          ],
        },
      ],
    }),
    canSeeQueue
      ? payload
          .count({
            collection: "payload-jobs",
            where: { and: [{ taskSlug: { equals: "schedulePublish" } }, { site: { equals: site.id } }, { completedAt: { exists: false } }] },
            overrideAccess: true,
          })
          .then((r) => r.totalDocs)
      : Promise.resolve(0),
    // Reader numbers only for those who manage memberships of this site.
    hasSiteRole(user, site.id, ["admin"])
      ? payload
          .count({ collection: "members", where: { "memberships.site": { equals: site.id } }, overrideAccess: false, user })
          .then((r) => r.totalDocs)
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return { published, drafts, scheduled, stale, readers };
}

/** Title in the editor's content locale, else in the language it was written in, plus that locale. */
function pickTitle(value: unknown, locale: string): [string, string] {
  if (typeof value === "string") return [value, locale];
  if (!value || typeof value !== "object") return ["", locale];
  const byLocale = value as Record<string, unknown>;
  for (const code of [locale, "ru", "en", ...Object.keys(byLocale)]) {
    const text = byLocale[code];
    if (typeof text === "string" && text.trim()) return [text, code];
  }
  return ["", locale];
}

async function recentEdits(payload: Payload, user: TypedUser | null | undefined, locale: string): Promise<RecentItem[]> {
  const load = async (collection: "guides" | "pages") => {
    const { docs } = await payload.find({
      collection,
      draft: true,
      depth: 0,
      limit: RECENT_LIMIT,
      sort: "-updatedAt",
      locale: "all",
      overrideAccess: false,
      user,
      select: { title: true, site: true, _status: true, updatedAt: true } as never,
    });
    return (docs as unknown as { id: ID; title?: unknown; site?: unknown; _status?: string; updatedAt: string }[]).map((doc) => {
      const [title, titleLocale] = pickTitle(doc.title, locale);
      return {
        collection,
        id: doc.id,
        title,
        titleLocale,
        site: relationID(doc.site),
        status: doc._status ?? "draft",
        updatedAt: doc.updatedAt,
      };
    });
  };
  const [guides, pages] = await Promise.all([load("guides"), load("pages").catch(() => [])]);
  const recent = [...guides, ...pages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT);
  return markUnpublishedChanges(payload, user, recent);
}

/** A latest draft of a document that is live reads "draft"; tell it apart from a never-published draft. */
async function markUnpublishedChanges(payload: Payload, user: TypedUser | null | undefined, items: RecentItem[]): Promise<RecentItem[]> {
  const drafts = items.filter((item) => item.status !== "published");
  const liveKeys = new Set<string>();
  await Promise.all(
    (["guides", "pages"] as const).map(async (collection) => {
      const ids = drafts.filter((item) => item.collection === collection).map((item) => item.id);
      if (ids.length === 0) return;
      const { docs } = await payload
        .find({
          collection,
          draft: false,
          depth: 0,
          pagination: false,
          where: { and: [{ id: { in: ids } }, { _status: { equals: "published" } }] } as never,
          select: { _status: true } as never,
          overrideAccess: false,
          user,
        })
        .catch(() => ({ docs: [] }));
      for (const doc of docs as unknown as { id: ID }[]) liveKeys.add(`${collection}:${doc.id}`);
    }),
  );
  return items.map((item) => (liveKeys.has(`${item.collection}:${item.id}`) ? { ...item, status: "changed" } : item));
}

async function upcomingJobs(
  payload: Payload,
  user: TypedUser | null | undefined,
  owner: boolean,
  locale: string,
): Promise<UpcomingItem[]> {
  const sites = owner ? null : siteIDsWithRole(user, PUBLISH_ROLES);
  if (sites && sites.length === 0) return [];
  const { docs } = await payload.find({
    collection: "payload-jobs",
    where: {
      and: [
        { taskSlug: { equals: "schedulePublish" } },
        { completedAt: { exists: false } },
        ...(sites ? [{ site: { in: sites } }] : []),
      ],
    },
    sort: "waitUntil",
    limit: UPCOMING_LIMIT,
    depth: 0,
    overrideAccess: true,
  });
  const jobs = (docs as unknown as { id: ID; waitUntil?: string; site?: unknown; input?: Record<string, unknown> }[]).map((job) => {
    const input = job.input ?? {};
    const doc = input.doc as { relationTo?: string; value?: unknown } | undefined;
    return { job, input, collection: (doc?.relationTo === "pages" ? "pages" : "guides") as "guides" | "pages", docID: relationID(doc?.value) };
  });
  // One title query per collection instead of one per scheduled job.
  const titles = new Map<string, [string, string]>();
  await Promise.all(
    (["guides", "pages"] as const).map(async (collection) => {
      const ids = jobs.filter((j) => j.collection === collection && j.docID !== null).map((j) => j.docID as ID);
      if (ids.length === 0) return;
      const found = await payload
        .find({
          collection,
          where: { id: { in: ids } },
          draft: true,
          depth: 0,
          locale: "all",
          pagination: false,
          overrideAccess: false,
          user,
          select: { title: true } as never,
        })
        .catch(() => ({ docs: [] }));
      for (const doc of found.docs as unknown as { id: ID; title?: unknown }[]) {
        titles.set(`${collection}:${doc.id}`, pickTitle(doc.title, locale));
      }
    }),
  );
  return jobs.map(({ job, input, collection, docID }) => {
    const [title, titleLocale] = docID !== null ? (titles.get(`${collection}:${docID}`) ?? ["", locale]) : ["", locale];
    return {
      id: job.id,
      when: job.waitUntil ?? "",
      action: input.type === "unpublish" ? "unpublish" : "publish",
      collection,
      docID,
      title,
      titleLocale,
      site: relationID(job.site),
    } satisfies UpcomingItem;
  });
}
