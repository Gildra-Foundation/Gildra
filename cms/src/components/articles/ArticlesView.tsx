import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { canUseAdmin } from "../../access/roles";
import { adminLang } from "../../admin/text";
import { articlesData } from "../../articles/data";
import { normalizeArticlesQuery } from "../../articles/query";
import { Workspace } from "../workspace/Workspace";
import { ArticlesPanel } from "./ArticlesPanel";

export async function ArticlesView(view: AdminViewServerProps) {
  const { req } = view.initPageResult;
  if (!canUseAdmin(req.user)) redirect("/admin/login?redirect=%2Fadmin%2Farticles");
  const initialQuery = normalizeArticlesQuery(view.searchParams ?? {}, req.locale === "en" ? "en" : "ru");
  const initial = await articlesData(req, { ...initialQuery, page: String(initialQuery.page) });
  return <Workspace view={view}><ArticlesPanel initial={initial} initialQuery={initialQuery} lang={adminLang(req.i18n.language)} /></Workspace>;
}
