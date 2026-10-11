import { type CollectionConfig, type FieldAccess, Forbidden, type Where } from "payload";

import { asMember, asStaff, isOwner, relationID, sameID, siteIDsWithRole } from "../access/roles";

/** Fields a reader may change on their own profile. */
const PROFILE_SELF_FIELDS = new Set(["displayName", "bio", "handle", "visibility"]);

export const HANDLE_PATTERN = /^[a-z0-9_-]{3,30}$/;

const staffOrOwnerOfProfile: FieldAccess = ({ req, doc }) =>
  Boolean(asStaff(req.user)) || (asMember(req.user) !== null && sameID(doc?.member, req.user?.id));

/** Moderation: owners, plus site admins for readers who are members of their sites. */
function moderatorWhere(user: unknown): Where | true | null {
  if (isOwner(user)) return true;
  const sites = siteIDsWithRole(user, ["admin"]);
  return sites.length ? ({ "member.memberships.site": { in: sites } } as Where) : null;
}

/**
 * Public face of a reader: handle, display name, bio. Emails, memberships
 * and account state stay on `members`, which the public can never read.
 */
export const MemberProfiles: CollectionConfig = {
  slug: "member-profiles",
  labels: { singular: { en: "Reader profile", ru: "Профиль читателя" }, plural: { en: "Reader profiles", ru: "Профили читателей" } },
  admin: { useAsTitle: "handle", defaultColumns: ["handle", "displayName", "visibility"], group: { en: "Readers", ru: "Читатели" } },
  access: {
    read: ({ req }) => {
      const moderator = moderatorWhere(req.user);
      if (moderator === true) return true;
      const member = asMember(req.user);
      const clauses: Where[] = [{ visibility: { equals: "public" } }];
      if (member) clauses.push({ member: { equals: member.id } });
      if (moderator) clauses.push(moderator);
      return { or: clauses };
    },
    create: ({ req }) => isOwner(req.user) || asMember(req.user) !== null,
    update: ({ req }) => {
      const moderator = moderatorWhere(req.user);
      if (moderator) return moderator;
      const member = asMember(req.user);
      return member ? { member: { equals: member.id } } : false;
    },
    delete: ({ req }) => {
      if (isOwner(req.user)) return true;
      const member = asMember(req.user);
      return member ? { member: { equals: member.id } } : false;
    },
  },
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if (operation !== "update" || !asMember(req.user)) return args;
        const keys = Object.keys((args as { data?: object }).data ?? {});
        if (keys.some((key) => !PROFILE_SELF_FIELDS.has(key))) throw new Forbidden(req.t);
        return args;
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        const member = asMember(req.user);
        if (member) {
          if (operation === "create") data.member = member.id;
          else if (data.member !== undefined && !sameID(data.member, originalDoc?.member)) throw new Forbidden(req.t);
        } else if (req.user && !asStaff(req.user)) {
          throw new Forbidden(req.t);
        }
        if (operation === "update" && data.member !== undefined && !sameID(data.member, originalDoc?.member)) {
          throw new Forbidden(req.t);
        }
        if (typeof data.handle === "string") data.handle = data.handle.toLowerCase();
        if (relationID(data.member ?? originalDoc?.member) === null) throw new Forbidden(req.t);
        return data;
      },
    ],
  },
  fields: [
    {
      name: "member",
      type: "relationship",
      relationTo: "members",
      required: true,
      unique: true,
      access: { read: staffOrOwnerOfProfile },
      admin: { readOnly: true },
    },
    {
      name: "handle",
      type: "text",
      required: true,
      unique: true,
      validate: (value: unknown) =>
        typeof value === "string" && HANDLE_PATTERN.test(value.toLowerCase()) ? true : "3–30 characters: a-z, 0-9, _ or -.",
    },
    { name: "displayName", type: "text", required: true, maxLength: 60 },
    { name: "bio", type: "textarea", maxLength: 500 },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "public",
      options: [
        { label: { en: "Public", ru: "Публичный" }, value: "public" },
        { label: { en: "Hidden", ru: "Скрытый" }, value: "private" },
      ],
    },
  ],
};
