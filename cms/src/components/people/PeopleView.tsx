import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { canUseAdmin } from "../../access/roles";
import { adminLang } from "../../admin/text";
import { peopleData } from "../../people/data";
import { Workspace } from "../workspace/Workspace";
import { PeoplePanel } from "./PeoplePanel";

export async function PeopleView(view: AdminViewServerProps) {
  const { req } = view.initPageResult;
  if (!canUseAdmin(req.user)) redirect("/admin/login?redirect=%2Fadmin%2Fusers");
  const initial = await peopleData(req, {});
  return <Workspace view={view}><PeoplePanel initial={initial} lang={adminLang(req.i18n.language)} /></Workspace>;
}
