"use client";

import { useTenantSelection } from "@payloadcms/plugin-multi-tenant/client";
import { useAuth, useLocale, useRouteTransition, useTranslation } from "@payloadcms/ui";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";

import { isOwner, PUBLISH_ROLES, siteIDsWithRole, WRITE_ROLES } from "../../access/roles";
import { CONTENT_LOCALES } from "../../admin/completeness";
import { adminSections, canReadCollection } from "../../admin/navModel";
import { AdminSurface } from "../AdminSurface";
import { useChooseSite } from "../SiteLink";
import { CommandPalette as ValyroCommandPalette, type CommandPaletteItem, type CommandPaletteLabels } from "../valyro-ui/navigation/CommandPalette";

type Site = { id: number | string; name: string; slug?: string; domain?: string; defaultLocale?: string | null; publicUrl?: string | null };
type Hit = { key: string; collection: "guides" | "pages"; id: string | number; title: string; locales: string[]; site: string | null; status: string; query: string };

const COPY = {
  ru: {
    placeholder: "Раздел, статья или действие…",
    empty: "Ничего не нашлось",
    searching: "Ищу…",
    found: "Статьи и страницы",
    go: "Перейти",
    create: "Создать",
    site: "Сайт",
    language: "Язык этой версии",
    newArticle: (site: string) => `Новая статья — ${site}`,
    newPage: (site: string) => `Новая страница — ${site}`,
    upload: (site: string) => `Загрузить изображение — ${site}`,
    workOn: (site: string) => `Работать с сайтом ${site}`,
    allSites: "Все сайты",
    openSite: (domain: string) => `Открыть ${domain} ↗`,
    openLocale: (name: string) => `Открыть версию: ${name}`,
    article: "статья",
    page: "страница",
    draft: "черновик",
    untitled: "Без названия",
    label: "Поиск по админке",
    labels: {
      results: "Разделы, материалы и действия",
      navigate: "выбрать",
      run: "открыть",
      close: "закрыть",
      escapeKey: "esc",
      resultCount: (count: number) => `Найдено: ${count}`,
    } satisfies CommandPaletteLabels,
  },
  en: {
    placeholder: "Section, article or action…",
    empty: "Nothing found",
    searching: "Searching…",
    found: "Articles and pages",
    go: "Go to",
    create: "Create",
    site: "Site",
    language: "Language of this version",
    newArticle: (site: string) => `New article — ${site}`,
    newPage: (site: string) => `New page — ${site}`,
    upload: (site: string) => `Upload an image — ${site}`,
    workOn: (site: string) => `Work on ${site}`,
    allSites: "All sites",
    openSite: (domain: string) => `Open ${domain} ↗`,
    openLocale: (name: string) => `Open the ${name} version`,
    article: "article",
    page: "page",
    draft: "draft",
    untitled: "Untitled",
    label: "Search the admin",
    labels: {
      results: "Sections, content and actions",
      navigate: "select",
      run: "open",
      close: "close",
      escapeKey: "esc",
      resultCount: (count: number) => `${count} ${count === 1 ? "result" : "results"}`,
    } satisfies CommandPaletteLabels,
  },
};

const norm = (text: string) => text.toLowerCase().replace(/ё/g, "е");
// Valyro filters every command by its label and keywords; search hits carry the query that found them (by title or address).
/** Every word of the query appears somewhere in `text`. */
const matches = (text: string, query: string) => {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const haystack = norm(text);
  return words.every((word) => haystack.includes(word));
};

let sitesRequest: Promise<Site[]> | null = null;
function loadSites(): Promise<Site[]> {
  sitesRequest ??= fetch(
    "/api/sites?depth=0&limit=50&sort=name&select[name]=true&select[slug]=true&select[domain]=true&select[defaultLocale]=true&select[publicUrl]=true",
    { credentials: "include" },
  )
    .then((response) => (response.ok ? response.json() : { docs: [] }))
    .then((body: { docs?: Site[] }) => body.docs ?? [])
    .catch(() => {
      sitesRequest = null;
      return [];
    });
  return sitesRequest;
}

async function searchDocs(query: string, collections: ("guides" | "pages")[], signal: AbortSignal): Promise<Hit[]> {
  const requests = collections.flatMap((collection) =>
    CONTENT_LOCALES.map(async ({ code }) => {
      const params = new URLSearchParams({
        "where[or][0][title][like]": query,
        "where[or][1][slug][like]": query,
        locale: code,
        "fallback-locale": "none",
        draft: "true",
        depth: "0",
        limit: "8",
        sort: "-updatedAt",
        "select[title]": "true",
        "select[slug]": "true",
        "select[site]": "true",
        "select[_status]": "true",
      });
      const response = await fetch(`/api/${collection}?${params}`, { credentials: "include", signal });
      if (!response.ok) return [];
      const body = (await response.json()) as { docs?: { id: string | number; title?: string | null; slug?: string; site?: unknown; _status?: string }[] };
      return (body.docs ?? []).map((doc) => ({ collection, code, doc }));
    }),
  );
  const merged = new Map<string, Hit>();
  for (const rows of await Promise.all(requests)) {
    for (const { collection, code, doc } of rows) {
      const key = `${collection}:${doc.id}`;
      const hit = merged.get(key) ?? {
        key,
        collection,
        id: doc.id,
        title: "",
        locales: [],
        site: doc.site === null || doc.site === undefined ? null : String(typeof doc.site === "object" ? (doc.site as { id: unknown }).id : doc.site),
        status: doc._status ?? "draft",
        query,
      };
      const title = typeof doc.title === "string" ? doc.title.trim() : "";
      if (title && (!hit.title || matches(title, query))) hit.title = title;
      if (title || matches(doc.slug ?? "", query)) hit.locales.push(code);
      if (!hit.title && doc.slug) hit.title = doc.slug;
      merged.set(key, hit);
    }
  }
  return [...merged.values()].slice(0, 12);
}

/**
 * Command palette (Valyro CommandPalette in the Gildra theme): jump to any section,
 * find an article or page by title or address in either language, create on a
 * chosen site, switch the working site or the language version being edited.
 * Everything respects the viewer's permissions; search goes through the REST
 * API with the viewer's own access.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "en" ? "en" : "ru";
  const t = COPY[lang];
  const { user, permissions } = useAuth();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { startRouteTransition } = useRouteTransition();
  const tenants = useTenantSelection();
  const chooseSite = useChooseSite();
  const [query, setQuery] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void loadSites().then(setSites);
  }, []);

  const sections = useMemo(() => adminSections(user, permissions as never, lang), [user, permissions, lang]);
  const readable = useMemo(() => {
    const collections = (permissions as { collections?: Record<string, unknown> } | undefined)?.collections ?? {};
    return new Set(Object.keys(collections).filter((slug) => canReadCollection(permissions as never, slug)));
  }, [permissions]);
  const canRead = (slug: string) => readable.has(slug);
  const searchable = useMemo(() => (["guides", "pages"] as const).filter((slug) => readable.has(slug)), [readable]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || searchable.length === 0) {
      setHits([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchDocs(q, [...searchable], controller.signal)
        .then((found) => {
          setHits(found);
          setSearching(false);
        })
        .catch(() => undefined);
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchable]);

  const go = (href: string) => {
    onClose();
    startRouteTransition(() => router.push(href));
  };
  const siteName = (id: string | null) => sites.find((s) => String(s.id) === id)?.name ?? "";
  const owner = isOwner(user);
  const writeSites = owner ? sites : sites.filter((s) => siteIDsWithRole(user, WRITE_ROLES).map(String).includes(String(s.id)));
  const publishSites = owner ? sites : sites.filter((s) => siteIDsWithRole(user, PUBLISH_ROLES).map(String).includes(String(s.id)));
  const docMatch = pathname.match(/^\/admin\/collections\/(guides|pages)\/([^/]+)$/);
  const inDocument = docMatch && docMatch[2] !== "create";
  const navItems = sections.flatMap((section) => section.items.map((item) => ({ ...item, group: section.title ?? "" })));
  const createItems = [
    ...(canRead("guides") ? writeSites.map((s) => ({ key: `g${s.id}`, label: t.newArticle(s.name), site: s, href: `/admin/collections/guides/create?locale=${s.defaultLocale ?? "en"}` })) : []),
    ...(canRead("pages") ? publishSites.map((s) => ({ key: `p${s.id}`, label: t.newPage(s.name), site: s, href: `/admin/collections/pages/create?locale=${s.defaultLocale ?? "en"}` })) : []),
    ...(canRead("media") ? writeSites.map((s) => ({ key: `m${s.id}`, label: t.upload(s.name), site: s, href: "/admin/collections/media/create" })) : []),
  ];
  const tenantOptions = tenants?.options ?? [];
  const siteItems = [
    ...(tenantOptions.length > 1
      ? tenantOptions.map((o) => ({ key: `t${o.value}`, label: t.workOn(String(o.label ?? o.value)), run: () => tenants?.setTenant({ id: o.value, refresh: true }), current: o.value === tenants?.selectedTenantID }))
      : []),
    ...(owner && tenantOptions.length > 1 ? [{ key: "tall", label: t.allSites, run: () => tenants?.setTenant({ id: undefined, refresh: true }), current: tenants?.selectedTenantID === undefined }] : []),
    ...sites.filter((s) => s.publicUrl).map((s) => ({ key: `o${s.id}`, label: t.openSite(s.domain ?? s.name), run: () => window.open(s.publicUrl ?? "", "_blank", "noopener"), current: false })),
  ];
  const localeItems = inDocument
    ? CONTENT_LOCALES.filter((l) => l.code !== locale?.code).map((l) => ({ code: l.code, label: t.openLocale(lang === "ru" ? l.ru : l.en) }))
    : [];

  // Group order: found content, language version, sections, create, site.
  const commands: CommandPaletteItem[] = [
    ...hits.map((hit) => ({
      id: `hit-${hit.key}`,
      label: hit.title || t.untitled,
      group: t.found,
      keywords: [hit.query],
      trailing: (
        <>
          <span className="gd-cmd__meta">
            {hit.collection === "guides" ? t.article : t.page}
            {hit.site ? ` · ${siteName(hit.site)}` : ""}
            {hit.status !== "published" ? ` · ${t.draft}` : ""}
          </span>
          <span className="gd-cmd__langs">
            {hit.locales.map((code) => (
              <span key={code}>{code.toUpperCase()}</span>
            ))}
          </span>
        </>
      ),
      onSelect: () => go(`/admin/collections/${hit.collection}/${hit.id}?locale=${hit.locales.includes(locale?.code ?? "") ? locale?.code : (hit.locales[0] ?? "en")}`),
    })),
    ...localeItems.map((item) => ({
      id: `locale-${item.code}`,
      label: item.label,
      group: t.language,
      keywords: [t.language, "язык", "language", item.code],
      onSelect: () => {
        const params = new URLSearchParams(window.location.search);
        params.set("locale", item.code);
        go(`${pathname}?${params.toString()}`);
      },
    })),
    ...navItems.map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      group: t.go,
      keywords: [item.group],
      trailing: item.group ? <span className="gd-cmd__meta">{item.group}</span> : undefined,
      onSelect: () => go(item.href),
    })),
    ...createItems.map((item) => ({
      id: `create-${item.key}`,
      label: `+ ${item.label}`,
      group: t.create,
      keywords: [t.create],
      onSelect: () => chooseSite(String(item.site.id), item.href),
    })),
    ...siteItems.map((item) => ({
      id: `site-${item.key}`,
      label: item.label,
      group: t.site,
      keywords: [t.site],
      trailing: item.current ? <span className="gd-cmd__meta">✓</span> : undefined,
      onSelect: item.run,
    })),
  ];

  return (
    <AdminSurface lang={lang}>
      <ValyroCommandPalette
        open
        onOpenChange={(open) => !open && onClose()}
        aria-label={t.label}
        placeholder={t.placeholder}
        labels={t.labels}
        commands={commands}
        renderEmpty={(text) => (searching && text.length >= 2 ? t.searching : t.empty)}
        className="gd-cmd"
        // The palette keeps its query inside; typing bubbles up here to drive the server search.
        onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
      />
    </AdminSurface>
  );
}
