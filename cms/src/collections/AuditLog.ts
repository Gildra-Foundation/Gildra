import type { CollectionConfig } from "payload";

import { isOwner, nobody, siteIDsWithRole } from "../access/roles";

/**
 * Append-only journal of security-relevant changes: platform/site roles,
 * reader memberships and blocking, site configuration. Written only by
 * server hooks with `overrideAccess`; nobody can create, edit or delete it
 * through the API. Content history is covered by versions instead.
 */
export const AuditLog: CollectionConfig = {
  slug: "audit-log",
  labels: { singular: { en: "Audit entry", ru: "Запись журнала" }, plural: { en: "Audit log", ru: "Журнал действий" } },
  admin: {
    useAsTitle: "action",
    defaultColumns: ["action", "actorEmail", "targetCollection", "targetId", "createdAt"],
    group: { en: "Platform", ru: "Платформа" },
  },
  access: {
    read: ({ req }) => {
      if (isOwner(req.user)) return true;
      const sites = siteIDsWithRole(req.user, ["admin"]);
      return sites.length ? { site: { in: sites } } : false;
    },
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  disableDuplicate: true,
  fields: [
    { name: "action", type: "text", required: true, index: true },
    { name: "actorCollection", type: "text", required: true },
    { name: "actorId", type: "text" },
    { name: "actorEmail", type: "text" },
    { name: "targetCollection", type: "text", required: true, index: true },
    { name: "targetId", type: "text", required: true, index: true },
    { name: "site", type: "relationship", relationTo: "sites", index: true },
    { name: "changes", type: "json" },
  ],
};
