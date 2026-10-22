import { APIError, type CollectionConfig, type FieldAccess, type Where } from "payload";

import { asStaff, canUseAdmin, isOwner, SITE_ROLES, siteIDsWithRole } from "../access/roles";
import { assertStaffRecoveryAvailable } from "../email";
import { auditAfterChange, auditAfterDelete } from "../hooks/audit";

const BOOTSTRAP = "gildra:bootstrapOwner";

/** Roles and assignments are writable by owners only (plus the very first account). */
const ownerOrBootstrap: FieldAccess = ({ req }) => isOwner(req.user) || req.context[BOOTSTRAP] === true;

async function otherOwners(req: Parameters<FieldAccess>[0]["req"], id: unknown): Promise<number> {
  const { totalDocs } = await req.payload.count({
    collection: "admins",
    where: { and: [{ platformRole: { equals: "owner" } }, { id: { not_equals: id } }] },
    overrideAccess: true,
    req,
  });
  return totalDocs;
}

/**
 * Staff accounts (the only collection allowed into the admin panel).
 * Existing accounts keep their IDs, emails and password hashes; the migration
 * marks them as platform owners so nobody silently loses access.
 */
export const Admins: CollectionConfig = {
  slug: "admins",
  auth: true,
  labels: { singular: { en: "Staff member", ru: "Сотрудник" }, plural: { en: "Staff", ru: "Сотрудники" } },
  access: {
    admin: ({ req }) => canUseAdmin(req.user),
    create: async ({ req }) => {
      if (isOwner(req.user)) return true;
      if (req.user) return false;
      // First-user bootstrap: only while there is no account at all.
      const existing = await req.payload.count({ collection: "admins", overrideAccess: true, req });
      return existing.totalDocs === 0;
    },
    read: ({ req }): boolean | Where => {
      const staff = asStaff(req.user);
      if (!staff) return false;
      if (isOwner(staff)) return true;
      // Site admins/editors see colleagues of their sites (the plugin adds that
      // constraint); everyone else only themselves.
      const managedSites = siteIDsWithRole(staff, ["admin", "editor"]);
      if (managedSites.length > 0) return { or: [{ id: { equals: staff.id } }, { "sites.site": { in: managedSites } }] };
      return { id: { equals: staff.id } };
    },
    update: ({ req }) => {
      const staff = asStaff(req.user);
      if (!staff) return false;
      return isOwner(staff) ? true : { id: { equals: staff.id } };
    },
    delete: ({ req }) => isOwner(req.user),
    unlock: ({ req }) => isOwner(req.user),
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "platformRole"],
    group: { en: "Platform", ru: "Платформа" },
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation, req }) => {
        // Refuse recovery uniformly when email is unavailable, before Payload looks
        // up the address. Otherwise a 503 for an existing account leaks existence.
        if (operation === "forgotPassword") await assertStaffRecoveryAvailable();
        if (operation !== "create") return args;
        const existing = await req.payload.count({ collection: "admins", overrideAccess: true, req });
        if (existing.totalDocs === 0) {
          req.context[BOOTSTRAP] = true;
          args.data = { ...args.data, platformRole: "owner" };
        }
        return args;
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (
          operation === "update" &&
          originalDoc?.platformRole === "owner" &&
          data.platformRole !== undefined &&
          data.platformRole !== "owner" &&
          (await otherOwners(req, originalDoc.id)) === 0
        ) {
          throw new APIError("The last platform owner cannot be demoted.", 409);
        }
        return data;
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const doc = await req.payload.findByID({ collection: "admins", id, depth: 0, overrideAccess: true, req });
        if (doc.platformRole === "owner" && (await otherOwners(req, id)) === 0) {
          throw new APIError("The last platform owner cannot be deleted.", 409);
        }
      },
    ],
    afterChange: [auditAfterChange("admins", ["platformRole", "sites", "email"])],
    afterDelete: [auditAfterDelete("admins")],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "platformRole",
      type: "select",
      required: true,
      defaultValue: "staff",
      saveToJWT: true,
      access: { create: ownerOrBootstrap, update: ownerOrBootstrap },
      options: [
        { label: { en: "Platform owner", ru: "Владелец платформы" }, value: "owner" },
        { label: { en: "Site staff", ru: "Сотрудник сайтов" }, value: "staff" },
      ],
      admin: { position: "sidebar", description: "Owners manage every site and provision staff." },
    },
    {
      // Consumed by the multi-tenant plugin (tenantsArrayField.includeDefaultField = false).
      name: "sites",
      type: "array",
      saveToJWT: true,
      labels: { singular: { en: "Site role", ru: "Роль на сайте" }, plural: { en: "Site roles", ru: "Роли на сайтах" } },
      access: { create: ownerOrBootstrap, update: ownerOrBootstrap },
      fields: [
        { name: "site", type: "relationship", relationTo: "sites", required: true, index: true, saveToJWT: true },
        {
          name: "role",
          type: "select",
          required: true,
          saveToJWT: true,
          options: SITE_ROLES.map((value) => ({
            value,
            label: {
              admin: { en: "Site admin", ru: "Администратор" },
              editor: { en: "Editor", ru: "Редактор" },
              author: { en: "Author", ru: "Автор" },
              analyst: { en: "Analyst", ru: "Аналитик" },
            }[value],
          })),
        },
      ],
      validate: (rows: unknown) => {
        if (!Array.isArray(rows)) return true;
        const seen = new Set<string>();
        for (const row of rows as { site?: unknown }[]) {
          const key = String(typeof row.site === "object" && row.site ? (row.site as { id: unknown }).id : row.site);
          if (seen.has(key)) return "Each site may appear only once.";
          seen.add(key);
        }
        return true;
      },
    },
  ],
};
