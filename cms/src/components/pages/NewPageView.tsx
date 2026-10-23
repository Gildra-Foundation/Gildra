import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { canUseAdmin } from "../../access/roles";
import { selectionAllows, SITE_COOKIE, writableSites } from "../../admin/siteChoice";
import { adminLang } from "../../admin/text";
import { pagesForSite } from "../../blocks/contract";
import { Workspace } from "../workspace/Workspace";
import { NewPagePanel } from "./NewPagePanel";

/**
 * /admin/new-page — choose which site page to override. The document is
 * created by the submit, not by opening the page, so there is no empty draft.
 */
export async function NewPageView(view: AdminViewServerProps) {
  const { req } = view.initPageResult;
  if (!canUseAdmin(req.user)) redirect("/admin/login?redirect=%2Fadmin%2Fnew-page");
  const lang = adminLang(req.i18n.language);
  const raw = (view.searchParams as Record<string, string | string[] | undefined> | undefined)?.locale;
  const locale = raw === "en" || raw === "ru" ? raw : lang;
  const sites = await writableSites(req.payload, req.user, "pages");
  const selected = (await cookies()).get(SITE_COOKIE)?.value;
  if (!selectionAllows(selected, sites)) redirect(`/admin/select-site?collection=pages&locale=${locale}`);
  const site = sites.find((s) => String(s.id) === selected)!;
  const siteDoc = await req.payload.findByID({ collection: "sites", id: site.id, depth: 0, overrideAccess: true, select: { slug: true } as never });
  const slug = (siteDoc as { slug?: string }).slug ?? null;
  const existing = await req.payload.find({ collection: "pages", draft: true, depth: 0, pagination: false, req, user: req.user, overrideAccess: false,
    where: { site: { equals: site.id } }, select: { slug: true } as never });
  const taken = new Set(existing.docs.map((d) => (d as { slug?: string }).slug).filter((s): s is string => typeof s === "string"));
  const pages = pagesForSite(slug).map((p) => ({ id: p.id, taken: taken.has(p.id) }));
  return <Workspace view={view}><NewPagePanel site={{ id: String(site.id), name: site.name }} pages={pages} locale={locale} lang={lang} /></Workspace>;
}
