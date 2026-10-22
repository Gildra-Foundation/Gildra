import { DefaultTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import React from "react";

import { CREATE_ROLES, writableSites } from "../admin/siteChoice";
import { adminLang, adminText } from "../admin/text";
import { canUseAdmin } from "../access/roles";
import { SelectSitePanel } from "./SelectSitePanel";
import { headerActions } from "./nav/headerActions";

/**
 * /admin/select-site?collection=<slug> — shown instead of an empty editor when
 * a site-scoped document is created without a usable site selection. The
 * choice sets the same cookie as the native "Site" selector in the sidebar.
 */
export async function SelectSiteView({ initPageResult, params, searchParams, user }: AdminViewServerProps) {
  const { req, permissions, visibleEntities, locale } = initPageResult;
  if (!canUseAdmin(req.user)) redirect("/admin/login");
  const raw = (searchParams as Record<string, string | string[] | undefined>)?.collection;
  const collection = typeof raw === "string" && raw in CREATE_ROLES ? raw : null;
  const language = (searchParams as Record<string, string | string[] | undefined>)?.locale;
  const suffix = language === "en" || language === "ru" ? `?locale=${language}` : "";
  const sites = collection ? await writableSites(req.payload, req.user, collection) : [];
  const lang = adminLang(req.i18n.language);
  const t = adminText(lang);

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
      viewActions={headerActions(req.payload.config)}
    >
      <div className="gutter--left gutter--right" style={{ paddingBlock: "var(--base)", maxWidth: 720 }}>
        <h1>{t.chooseSite}</h1>
        {!collection ? (
          <p role="alert">{t.chooseSiteUnknown}</p>
        ) : (
          <SelectSitePanel
            sites={sites.map((s) => ({ id: String(s.id), name: s.name, domain: s.domain, game: s.game }))}
            target={`/admin/collections/${collection}/create${suffix}`}
            listHref={`/admin/collections/${collection}${suffix}`}
            collection={collection}
            lang={lang}
          />
        )}
      </div>
    </DefaultTemplate>
  );
}
