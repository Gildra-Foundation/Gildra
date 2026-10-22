import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";
import { headerActions } from "../nav/headerActions";

/** Native chrome, with Payload's already sanitized client-facing user and the header actions (search, RU / EN). */
export function Workspace({ view, children }: { view: AdminViewServerProps; children: ReactNode }) {
  const { req, permissions, visibleEntities, locale } = view.initPageResult;
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={view.params}
    payload={req.payload} permissions={permissions} req={req} searchParams={view.searchParams}
    user={view.user} visibleEntities={visibleEntities} viewActions={headerActions(req.payload.config)}>
    <div className="gutter--left gutter--right gd-workspace">{children}</div>
  </DefaultTemplate>;
}
