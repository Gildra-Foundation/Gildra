import type { Payload } from "payload";
import React from "react";
import "./blocksEditor.css";

import { relationID } from "../../access/roles";
import { findPage, pageLabel, pageUrls, type Lang } from "../../blocks/contract";
import { checkBlocks } from "../../blocks/validate";

/**
 * List columns of the pages collection: the site page (label, id, public
 * URLs) and the state of the blocks in the list's language. Server cells; the
 * site slug is cached per process because sites change rarely.
 */
type CellProps = { rowData?: { site?: unknown; slug?: unknown; blocks?: unknown }; payload?: Payload; i18n?: { language?: string } };

const SITE_MS = 60_000;
const siteSlugs = new Map<string, { slug: string | null; at: number }>();

async function siteSlug(payload: Payload | undefined, site: unknown): Promise<string | null> {
  if (site && typeof site === "object" && typeof (site as { slug?: unknown }).slug === "string") return (site as { slug: string }).slug;
  const id = relationID(site as never);
  if (id === null || !payload) return null;
  const hit = siteSlugs.get(String(id));
  if (hit && Date.now() - hit.at < SITE_MS) return hit.slug;
  const doc = (await payload.findByID({ collection: "sites", id, depth: 0, overrideAccess: true, disableErrors: true }).catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof doc?.slug === "string" ? doc.slug : null;
  siteSlugs.set(String(id), { slug, at: Date.now() });
  return slug;
}

const langOf = (i18n: CellProps["i18n"]): Lang => (i18n?.language === "en" ? "en" : "ru");

export async function SitePageCell({ rowData, payload, i18n }: CellProps) {
  const lang = langOf(i18n);
  const page = findPage(await siteSlug(payload, rowData?.site), rowData?.slug);
  const id = typeof rowData?.slug === "string" ? rowData.slug : "";
  if (!page) return <span className="gd-cell-page"><span>{id}</span><small>{lang === "ru" ? "нет в списке сайта" : "not in the site's list"}</small></span>;
  const urls = pageUrls(page);
  return (
    <span className="gd-cell-page">
      <span>{pageLabel(page.id, lang)}</span>
      <small>
        <code>{page.id}</code> · {urls.en} · {urls.ru}
      </small>
    </span>
  );
}

export async function BlocksStateCell({ rowData, payload, i18n }: CellProps) {
  const lang = langOf(i18n);
  const ru = lang === "ru";
  const blocks = rowData?.blocks;
  const count = Array.isArray(blocks) ? blocks.length : 0;
  if (!count) return <span className="gd-cell-blocks" data-state="empty">{ru ? "пусто · из кода" : "empty · from code"}</span>;
  const page = findPage(await siteSlug(payload, rowData?.site), rowData?.slug);
  const issues = checkBlocks(blocks, page?.blocks ?? null).length;
  return (
    <span className="gd-cell-blocks" data-state={issues ? "bad" : "ok"}>
      {count} · {issues ? (ru ? `ошибок: ${issues}` : `${issues} errors`) : ru ? "проверены" : "valid"}
    </span>
  );
}
