import type { TypedUser } from "payload";
import React from "react";

import { ANALYTICS_ROLES, isOwner, siteIDsWithRole } from "../access/roles";
import { adminText } from "../admin/text";

/** Nav entry shown only to staff who may read analytics of at least one site. */
export function AnalyticsNavLink({ user, i18n }: { user?: TypedUser | null; i18n?: { language?: string } }) {
  if (!isOwner(user) && siteIDsWithRole(user, ANALYTICS_ROLES).length === 0) return null;
  return (
    <a className="nav__link" href="/admin/analytics" style={{ display: "block", padding: "4px 0" }}>
      <span className="nav__link-label">{adminText(i18n?.language).analyticsTitle}</span>
    </a>
  );
}
