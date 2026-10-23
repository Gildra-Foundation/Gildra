import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { canUseAdmin } from "../../access/roles";
import { selectionAllows, SITE_COOKIE, writableSites } from "../../admin/siteChoice";
import { adminLang } from "../../admin/text";
import { Workspace } from "../workspace/Workspace";
import { NewArticlePanel } from "./NewArticlePanel";

/**
 * /admin/articles/new — the first step of a new article. The document is
 * created by the first input here, not by opening the page, so abandoning the
 * form leaves no empty draft behind.
 */
export async function NewArticleView(view: AdminViewServerProps) {
  const { req } = view.initPageResult;
  if (!canUseAdmin(req.user)) redirect("/admin/login?redirect=%2Fadmin%2Farticles%2Fnew");
  const lang = adminLang(req.i18n.language);
  const raw = (view.searchParams as Record<string, string | string[] | undefined> | undefined)?.locale;
  const locale = raw === "en" || raw === "ru" ? raw : lang;
  const sites = await writableSites(req.payload, req.user, "guides");
  const selected = (await cookies()).get(SITE_COOKIE)?.value;
  if (!selectionAllows(selected, sites)) redirect(`/admin/select-site?collection=guides&locale=${locale}`);
  const site = sites.find((s) => String(s.id) === selected)!;
  return <Workspace view={view}><NewArticlePanel site={{ id: String(site.id), name: site.name }} locale={locale} lang={lang} /></Workspace>;
}
