import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import { type AdminViewServerProps, parseCookies } from "payload";
import React from "react";

import { ANALYTICS_ROLES, asStaff, canUseAdmin, isOwner, siteIDsWithRole } from "../access/roles";
import { adminLang, adminText } from "../admin/text";
import { AnalyticsPanel } from "./AnalyticsPanel";

/** /admin/analytics — Plausible statistics for the sites the viewer may analyse. */
export async function AnalyticsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, visibleEntities, locale } = initPageResult;
  // Custom admin views are routed even without a session; send those to the login.
  if (!canUseAdmin(req.user)) redirect("/admin/login?redirect=%2Fadmin%2Fanalytics");
  const lang = adminLang(req.i18n.language);
  const t = adminText(lang);
  const staff = asStaff(req.user);
  const allowed = staff ? (isOwner(staff) ? null : siteIDsWithRole(staff, ANALYTICS_ROLES)) : [];

  const sites =
    allowed && allowed.length === 0
      ? []
      : (
          await req.payload.find({
            collection: "sites",
            where: allowed ? { id: { in: allowed } } : {},
            depth: 0,
            pagination: false,
            overrideAccess: true,
            sort: "name",
          })
        ).docs.map((s) => ({ id: s.id, name: s.name, configured: Boolean(s.plausibleSiteId) }));

  // Start on the site chosen in the native site selector (cookie `payload-tenant`) when it is analysable.
  const selected = parseCookies(req.headers).get("payload-tenant");
  const initialSiteID = sites.find((s) => String(s.id) === selected)?.id ?? sites[0]?.id ?? null;

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user ?? undefined}
      visibleEntities={visibleEntities}
    >
      <div className="gutter--left gutter--right" style={{ paddingBlock: "var(--base)" }}>
        <h1>{t.analyticsTitle}</h1>
        {sites.length === 0 ? (
          <p>{t.analyticsNone}</p>
        ) : (
          <AnalyticsPanel sites={sites} initialSiteID={initialSiteID} lang={lang} />
        )}
      </div>
    </DefaultTemplate>
  );
}
