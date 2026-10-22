import {
  APIError,
  AuthenticationError,
  type CollectionConfig,
  type FieldAccess,
  Forbidden,
  type PayloadRequest,
  type Where,
} from "payload";

import { asMember, asStaff, type ID, isOwner, relationID, sameID, siteIDsWithRole } from "../access/roles";
import { emailMode, escapeHtml } from "../email";
import { auditAfterChange, auditAfterDelete } from "../hooks/audit";
import { memberEndpoints } from "../members/endpoints";

/** Context keys set by the site-scoped member endpoints. */
export const MEMBER_SITE = "gildra:memberSite";
export const MEMBER_LOGIN_SITE = "gildra:memberLoginSite";
/** Written by beforeLogin for the site-login endpoint (see members/endpoints.ts). */
export const MEMBER_LOGIN_OUTCOME = "gildra:memberLoginOutcome";
/**
 * Internal authority for POST /api/members/join: `{ member, site }`. Lets the
 * signed-in reader append exactly one active membership for that open site,
 * nothing else; the write runs with the reader as `req.user`, so it is audited
 * as that reader. Direct self-updates keep the password-only whitelist.
 */
export const MEMBER_JOIN = "gildra:memberJoin";
/** Set for Payload's reset-password flow, which logs the reader in afterwards. */
const RESET_FLOW = "gildra:memberResetFlow";

/** Fields a reader may change on their own account. Everything else is server-controlled. */
const MEMBER_SELF_FIELDS = new Set(["password"]);
/** Site admins manage only memberships of their own sites. */
const SITE_ADMIN_FIELDS = new Set(["memberships"]);
// Payload's native form posts read-only values too. Accept only unchanged
// copies of these known scalars, then remove them before the actual write.
const SITE_ADMIN_FORM_FIELDS = new Set(["id", "email", "_verified", "blocked", "blockedReason", "createdAt", "updatedAt"]);

type Membership = { site?: unknown; status?: unknown; joinedAt?: unknown; id?: unknown };

const staffOnly: FieldAccess = ({ req }) => isOwner(req.user) || siteIDsWithRole(req.user, ["admin"]).length > 0;
const ownerOnlyField: FieldAccess = ({ req }) => isOwner(req.user);
const staffOrSelf: FieldAccess = ({ req, id }) =>
  Boolean(asStaff(req.user)) || (asMember(req.user) !== null && id !== undefined && sameID(req.user?.id, id));

async function linkOrigin(req: PayloadRequest, user: { memberships?: Membership[] | null }): Promise<string | null> {
  const contextSite = relationID(req.context[MEMBER_SITE]);
  const fallback = (user.memberships ?? []).find((m) => m.status === "active")?.site;
  const siteID = contextSite ?? relationID(fallback);
  if (siteID === null) return null;
  const site = await req.payload.findByID({ collection: "sites", id: siteID, depth: 0, overrideAccess: true, req, disableErrors: true });
  return site?.publicUrl ? site.publicUrl.replace(/\/$/, "") : null;
}

async function emailBody(req: PayloadRequest, user: { memberships?: Membership[] | null }, path: string, token: string, intro: string) {
  const origin = await linkOrigin(req, user);
  if (!origin) throw new APIError("No site is associated with this account.", 409);
  const link = `${origin}${path}?token=${encodeURIComponent(token)}`;
  return `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p><p>If you did not request this, ignore this email.</p>`;
}

const rowKey = (row: Membership) =>
  JSON.stringify([row.id ?? null, String(relationID(row.site)), row.status ?? "active", row.joinedAt ? new Date(String(row.joinedAt)).toISOString() : null]);

function membershipKey(rows: Membership[] | null | undefined, sites: ID[]): string {
  return JSON.stringify(
    (rows ?? [])
      .filter((row) => sites.some((s) => sameID(s, row.site)))
      .map(rowKey)
      .sort(),
  );
}

/**
 * Readers of the network sites. A separate auth collection from staff:
 * never admitted to the admin panel, never matched by editorial access.
 * The Go API `users` / `auth_sessions` are a different system and untouched.
 */
export const Members: CollectionConfig = {
  slug: "members",
  labels: { singular: { en: "Reader", ru: "Читатель" }, plural: { en: "Readers", ru: "Читатели" } },
  auth: {
    useSessions: true,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 7 * 24 * 60 * 60,
    verify: {
      generateEmailSubject: () => "Confirm your email",
      generateEmailHTML: async ({ req, token, user }) =>
        emailBody(req, user, process.env.MEMBER_VERIFY_PATH || "/reader/verify", token, "Confirm your email address:"),
    },
    forgotPassword: {
      expiration: 60 * 60 * 1000,
      generateEmailSubject: () => "Reset your password",
      generateEmailHTML: async (args) =>
        emailBody(
          args!.req!,
          args!.user as { memberships?: Membership[] },
          process.env.MEMBER_RESET_PATH || "/reader/reset-password",
          String(args!.token),
          "Reset your password:",
        ),
    },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "blocked", "_verified", "createdAt"],
    listSearchableFields: ["email"],
    group: { en: "Readers", ru: "Читатели" },
  },
  access: {
    admin: () => false,
    create: ({ req }) => isOwner(req.user),
    read: ({ req }) => {
      if (isOwner(req.user)) return true;
      const adminSites = siteIDsWithRole(req.user, ["admin"]);
      if (adminSites.length) return { "memberships.site": { in: adminSites } } as Where;
      const member = asMember(req.user);
      return member ? { id: { equals: member.id } } : false;
    },
    update: ({ req }) => {
      if (isOwner(req.user)) return true;
      const adminSites = siteIDsWithRole(req.user, ["admin"]);
      if (adminSites.length) return { "memberships.site": { in: adminSites } } as Where;
      const member = asMember(req.user);
      return member ? { id: { equals: member.id } } : false;
    },
    delete: ({ req }) => isOwner(req.user),
    // Same tenant boundary as user management: only readers of the admin's sites.
    unlock: ({ req }) => {
      if (isOwner(req.user)) return true;
      const adminSites = siteIDsWithRole(req.user, ["admin"]);
      return adminSites.length ? ({ "memberships.site": { in: adminSites } } as Where) : false;
    },
  },
  endpoints: memberEndpoints,
  hooks: {
    beforeOperation: [
      async ({ args, operation, req }) => {
        if (operation === "forgotPassword" && emailMode() === "disabled") {
          throw new APIError("Email delivery is not configured.", 503, undefined, true);
        }
        if (operation === "resetPassword") req.context[RESET_FLOW] = true;
        if (operation !== "update") return args;
        const data = (args as { data?: Record<string, unknown> }).data ?? {};
        const keys = Object.keys(data);
        if (isOwner(req.user)) return args;
        const join = req.context[MEMBER_JOIN] as { member?: unknown } | undefined;
        const joining =
          join !== undefined && asMember(req.user) !== null && sameID(join.member, req.user?.id) && sameID((args as { id?: unknown }).id, req.user?.id);
        if (joining && keys.length === 1 && keys[0] === "memberships") return args;
        const allowed = asStaff(req.user) ? SITE_ADMIN_FIELDS : asMember(req.user) ? MEMBER_SELF_FIELDS : null;
        // Local API without a user (server code) is trusted; any other actor is whitelisted.
        if (allowed === null) {
          if (req.user) throw new Forbidden(req.t);
          return args;
        }
        const extra = keys.filter((key) => !allowed.has(key));
        if (extra.length) {
          const id = (args as { id?: string | number }).id;
          if (!asStaff(req.user) || id === undefined || extra.some((key) => !SITE_ADMIN_FORM_FIELDS.has(key))) throw new Forbidden(req.t);
          const original = await req.payload.findByID({ collection: "members", id, req, user: req.user,
            overrideAccess: false, depth: 0,
            select: { email: true, _verified: true, blocked: true, blockedReason: true, createdAt: true, updatedAt: true } });
          for (const key of extra) {
            const before = original[key as keyof typeof original];
            const equal = key === "id" ? sameID(data[key], before) : key === "blockedReason" ? (data[key] || null) === (before || null) : data[key] === before;
            if (!equal) throw new Forbidden(req.t);
          }
          for (const key of extra) delete data[key];
        }
        return args;
      },
    ],
    beforeChange: [
      ({ data, operation, originalDoc, req }) => {
        const join = req.context[MEMBER_JOIN] as { member?: unknown; site?: unknown } | undefined;
        if (join !== undefined && asMember(req.user) !== null) {
          // The only change a join may make: previous rows untouched, one active row appended.
          const prev = ((originalDoc?.memberships ?? []) as Membership[]).map(rowKey);
          const next = ((data.memberships ?? []) as Membership[]).map(rowKey);
          const added = (data.memberships ?? [])[next.length - 1] as Membership | undefined;
          const sameHead = next.length === prev.length + 1 && prev.every((row, i) => row === next[i]);
          if (operation !== "update" || !sameHead || !added || !sameID(added.site, join.site) || added.status !== "active") {
            throw new Forbidden(req.t);
          }
        }
        const staff = asStaff(req.user);
        if (staff && !isOwner(staff) && data.memberships !== undefined) {
          const adminSites = siteIDsWithRole(staff, ["admin"]);
          const next = (data.memberships ?? []) as Membership[];
          const prev = ((operation === "update" ? originalDoc?.memberships : []) ?? []) as Membership[];
          const foreign = [...new Set([...next, ...prev].map((r) => relationID(r.site)).filter((id) => id !== null))].filter(
            (id) => !adminSites.some((s) => sameID(s, id)),
          ) as ID[];
          if (membershipKey(next, foreign) !== membershipKey(prev, foreign)) throw new Forbidden(req.t);
        }
        if (Array.isArray(data.memberships)) {
          const seen = new Set<string>();
          for (const row of data.memberships as Membership[]) {
            const key = String(relationID(row.site));
            if (seen.has(key)) throw new APIError("Duplicate membership for one site.", 400);
            seen.add(key);
            row.joinedAt ??= new Date().toISOString();
          }
        }
        // Blocking revokes every active session immediately.
        const newlyBlocked =
          (data.blocked === true && originalDoc?.blocked !== true) ||
          (Array.isArray(data.memberships) &&
            (data.memberships as Membership[]).some(
              (row) =>
                row.status === "blocked" &&
                !((originalDoc?.memberships ?? []) as Membership[]).some((o) => sameID(o.site, row.site) && o.status === "blocked"),
            ));
        if (operation === "update" && newlyBlocked) data.sessions = [];
        return data;
      },
    ],
    beforeLogin: [
      ({ req, user }) => {
        // The reset token proves mailbox ownership; site access is still decided by /session.
        if (req.context[RESET_FLOW] === true && !user.blocked) return user;
        const site = relationID(req.context[MEMBER_LOGIN_SITE]);
        const memberships = (user.memberships ?? []) as Membership[];
        const active = site !== null && memberships.some((m) => sameID(m.site, site) && m.status === "active");
        // Password and verification were already checked when this hook runs.
        // Tell the site-login endpoint (only) that the account exists without a
        // row for this site, so it can offer opt-in enrollment. The login itself
        // still fails here and its session is rolled back.
        if (!active && !user.blocked && site !== null && !memberships.some((m) => sameID(m.site, site))) {
          req.context[MEMBER_LOGIN_OUTCOME] = { member: user.id, outcome: "no-membership" };
        }
        // Same generic error as a wrong password: no account-state disclosure.
        if (user.blocked || !active) throw new AuthenticationError(req.t);
        return user;
      },
    ],
    afterChange: [auditAfterChange("members", ["memberships", "blocked", "_verified", "email"])],
    beforeDelete: [
      // Deleting an account (owner-only, checked before this hook runs) also
      // removes its public profile, inside the same request/transaction: if
      // the account deletion fails, the profile stays. Without this, the
      // NOT NULL member_id would block the delete (FK says SET NULL).
      async ({ id, req }) => {
        await req.payload.delete({
          collection: "member-profiles",
          where: { member: { equals: id } },
          overrideAccess: true,
          req,
        });
      },
    ],
    afterDelete: [auditAfterDelete("members")],
  },
  fields: [
    {
      name: "memberships",
      type: "array",
      access: { create: staffOnly, update: staffOnly, read: staffOrSelf },
      admin: { description: "Server-controlled site memberships. Site admins manage rows of their own sites." },
      fields: [
        { name: "site", type: "relationship", relationTo: "sites", required: true, index: true },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "active",
          options: [
            { label: { en: "Active", ru: "Активен" }, value: "active" },
            { label: { en: "Blocked on this site", ru: "Заблокирован на сайте" }, value: "blocked" },
          ],
        },
        { name: "joinedAt", type: "date", admin: { readOnly: true } },
      ],
    },
    {
      name: "blocked",
      type: "checkbox",
      defaultValue: false,
      index: true,
      saveToJWT: true,
      access: { create: ownerOnlyField, update: ownerOnlyField, read: staffOrSelf },
      admin: { position: "sidebar", description: "Blocks the account on every site and ends all sessions." },
    },
    {
      name: "blockedReason",
      type: "text",
      access: { create: ownerOnlyField, update: ownerOnlyField, read: ({ req }) => Boolean(asStaff(req.user)) },
      admin: { position: "sidebar" },
    },
  ],
};
