import type { Endpoint } from "payload";

import { ANALYTICS_ROLES, asStaff, hasSiteRole } from "../access/roles";
import { json } from "../utilities/http";
import { fetchSiteReport, parseDateRange } from "./plausible";

/**
 * GET /api/analytics/report?site=<id>&period=30d  (or period=custom&from=…&to=…)
 *
 * Authorization happens before any upstream call: owners, or staff holding
 * admin/editor/analyst on that site. Readers and authors get 403.
 * Visitors are per site; the UI never sums them into "network people".
 */
export const analyticsReportEndpoint: Endpoint = {
  path: "/analytics/report",
  method: "get",
  handler: async (req) => {
    const staff = asStaff(req.user);
    if (!staff) return json({ status: "forbidden" }, 403);
    const siteParam = req.searchParams.get("site");
    if (!siteParam || !/^\d+$/.test(siteParam)) return json({ status: "invalid", field: "site" }, 400);
    if (!hasSiteRole(staff, siteParam, ANALYTICS_ROLES)) return json({ status: "forbidden" }, 403);

    const range = parseDateRange(req.searchParams.get("period") ?? "30d", req.searchParams.get("from"), req.searchParams.get("to"));
    if (!range) return json({ status: "invalid", field: "period" }, 400);

    const site = await req.payload.findByID({
      collection: "sites",
      id: Number(siteParam),
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    });
    if (!site) return json({ status: "not-found" }, 404);

    const result = await fetchSiteReport(site.plausibleSiteId, range);
    return json({ site: { id: site.id, name: site.name, slug: site.slug }, range, ...result });
  },
};
