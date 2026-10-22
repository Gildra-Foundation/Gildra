import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";
import type { ReactNode } from "react";

/** Native chrome, with Payload's already sanitized client-facing user. */
export function Workspace({ view, children }: { view: AdminViewServerProps; children: ReactNode }) {
  const { req, permissions, visibleEntities, locale } = view.initPageResult;
  return <DefaultTemplate i18n={req.i18n} locale={locale} params={view.params}
    payload={req.payload} permissions={permissions} req={req} searchParams={view.searchParams}
    user={view.user} visibleEntities={visibleEntities}>
    <div className="gutter--left gutter--right gd-workspace">{children}</div>
  </DefaultTemplate>;
}
