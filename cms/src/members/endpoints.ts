import { sql } from "@payloadcms/db-postgres";
import {
  commitTransaction,
  createLocalReq,
  type Endpoint,
  initTransaction,
  killTransaction,
  LockedAuth,
  type Payload,
  type PayloadRequest,
  UnverifiedEmail,
} from "payload";

import { asMember, sameID } from "../access/roles";
import { emailMode } from "../email";
import { clientKey, json, rateLimited, readJson } from "../utilities/http";

// Context keys mirrored from collections/Members.ts (kept here to avoid an import cycle).
const MEMBER_SITE = "gildra:memberSite";
const MEMBER_LOGIN_SITE = "gildra:memberLoginSite";
const MEMBER_JOIN = "gildra:memberJoin";
const MEMBER_LOGIN_OUTCOME = "gildra:memberLoginOutcome";

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const WINDOW = 15 * 60 * 1000;

type SiteDoc = { id: number | string; slug: string; registrationEnabled?: boolean | null };
type MembershipRow = { site?: unknown; status?: string | null };

async function findSite(payload: Payload, slug: unknown): Promise<SiteDoc | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  const { docs } = await payload.find({ collection: "sites", where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true });
  return (docs[0] as SiteDoc | undefined) ?? null;
}

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function handleFrom(displayName: string): string {
  const base = displayName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return `${base.length >= 3 ? base : "reader"}-${Math.floor(1000 + Math.random() * 9000)}`;
}

const registrationAvailable = (site: SiteDoc | null) => Boolean(site?.registrationEnabled) && emailMode() !== "disabled";

/** GET /api/members/availability?site=gildra — lets a site render an honest form state. */
const availability: Endpoint = {
  path: "/availability",
  method: "get",
  handler: async (req) => {
    const site = await findSite(req.payload, req.searchParams.get("site"));
    if (!site) return json({ status: "unknown-site" }, 404);
    return json({
      site: site.slug,
      registration: registrationAvailable(site) ? "open" : site.registrationEnabled ? "unavailable" : "closed",
      email: emailMode() === "disabled" ? "not-configured" : "configured",
    });
  },
};

/**
 * POST /api/members/register { site, email, password, displayName }
 * Always answers `pending-verification` for valid input, whether or not the
 * address already exists, so accounts cannot be enumerated.
 */
const register: Endpoint = {
  path: "/register",
  method: "post",
  handler: async (req) => {
    const body = await readJson(req);
    const site = await findSite(req.payload, body.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    if (!site.registrationEnabled) return json({ status: "registration-closed" }, 403);
    if (emailMode() === "disabled") return json({ status: "unavailable", reason: "email-not-configured" }, 503);
    if (rateLimited(`register:${clientKey(req)}`, 5, WINDOW)) return json({ status: "rate-limited" }, 429);

    const email = normaliseEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const invalid: string[] = [];
    if (!email) invalid.push("email");
    if (password.length < 10 || password.length > 128) invalid.push("password");
    if (displayName.length < 1 || displayName.length > 60) invalid.push("displayName");
    if (invalid.length) return json({ status: "invalid", fields: invalid }, 400);

    const existing = await req.payload.count({ collection: "members", where: { email: { equals: email } }, overrideAccess: true });
    if (existing.totalDocs > 0) return json({ status: "pending-verification" }, 202);

    let member: { id: number | string } | undefined;
    try {
      member = await req.payload.create({
        collection: "members",
        data: { email: email!, password, memberships: [{ site: site.id as number, status: "active" }] },
        context: { [MEMBER_SITE]: site.id },
        overrideAccess: true,
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 503) return json({ status: "unavailable", reason: "email-delivery-failed" }, 503);
      req.payload.logger.error({ msg: "Member registration failed", err: (error as Error).message });
      return json({ status: "error" }, 500);
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await req.payload.create({
          collection: "member-profiles",
          data: { member: member.id as number, handle: handleFrom(displayName), displayName, visibility: "public" },
          overrideAccess: true,
        });
        break;
      } catch (error) {
        if (attempt === 4) req.payload.logger.error({ msg: "Profile creation failed", err: (error as Error).message });
      }
    }
    return json({ status: "pending-verification" }, 202);
  },
};

/**
 * POST /api/members/site-login { site, email, password }
 * Returns a token for the site's own server proxy to keep in a first-party
 * httpOnly cookie. Plain /api/members/login is refused (no site context).
 */
const siteLogin: Endpoint = {
  path: "/site-login",
  method: "post",
  handler: async (req) => {
    const body = await readJson(req);
    const email = normaliseEmail(body.email);
    if (rateLimited(`login:${clientKey(req)}:${email ?? "-"}`, 10, WINDOW)) return json({ status: "rate-limited" }, 429);
    const site = await findSite(req.payload, body.site);
    if (!site || !email || typeof body.password !== "string") return json({ status: "invalid-credentials" }, 401);
    const password = body.password;

    const attempt = async () => {
      const context: Record<string, unknown> = { [MEMBER_LOGIN_SITE]: site.id };
      const loginReq = await createLocalReq({ context }, req.payload);
      try {
        const result = await req.payload.login({ collection: "members", data: { email, password }, req: loginReq });
        return { result, outcome: null };
      } catch (error) {
        // The Local API re-creates `req.context` (spread copy) on the same req object.
        const outcome = (loginReq.context?.[MEMBER_LOGIN_OUTCOME] ?? context[MEMBER_LOGIN_OUTCOME]) as
          | { member: number | string; outcome: string }
          | undefined;
        return { error: error as Error, outcome };
      }
    };

    let first = await attempt();
    let enrolled = false;
    // Credentials were confirmed by Payload (password + verified) but this
    // site has no membership row: offer, or with `enroll: true` perform, the
    // opt-in enrollment when the site's registration is open. A blocked row
    // never reaches this branch.
    if (!first.result && first.outcome?.outcome === "no-membership") {
      if (!site.registrationEnabled) return json({ status: "invalid-credentials" }, 401);
      if (body.enroll !== true) return json({ status: "enrollment-available" }, 409);
      const memberDoc = await req.payload.findByID({ collection: "members", id: first.outcome.member, depth: 0, overrideAccess: true });
      const memberReq = await createLocalReq({ user: { ...memberDoc, collection: "members" } as never }, req.payload);
      const outcome = await appendMembership(memberReq, memberDoc.id, site);
      if (outcome !== "joined" && outcome !== "member") return json({ status: "invalid-credentials" }, 401);
      enrolled = outcome === "joined";
      first = await attempt();
    }
    if (first.result) {
      return json({ status: "ok", token: first.result.token, exp: first.result.exp, member: { id: first.result.user?.id }, enrolled });
    }
    // instanceof, not error.name: production bundles minify class names.
    if (first.error instanceof UnverifiedEmail) return json({ status: "email-not-verified" }, 403);
    if (first.error instanceof LockedAuth) return json({ status: "locked" }, 423);
    return json({ status: "invalid-credentials" }, 401);
  },
};

/** GET /api/members/session?site=… with `Authorization: JWT <token>` from the site proxy. */
const session: Endpoint = {
  path: "/session",
  method: "get",
  handler: async (req) => {
    const member = asMember(req.user);
    if (!member) return json({ authenticated: false }, 401);
    const site = await findSite(req.payload, req.searchParams.get("site"));
    if (!site) return json({ status: "unknown-site" }, 404);
    const row = ((member.memberships ?? []) as MembershipRow[]).find((m) => sameID(m.site, site.id));
    const { docs } = await req.payload.find({
      collection: "member-profiles",
      where: { member: { equals: member.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const profile = docs[0];
    return json({
      authenticated: row?.status === "active",
      membership: row?.status ?? "none",
      member: { id: member.id },
      profile: profile ? { handle: profile.handle, displayName: profile.displayName, visibility: profile.visibility } : null,
    });
  },
};

/** POST /api/members/join { site } — an existing reader joins another open site. */
type SqlRunner = { execute: (query: unknown) => Promise<unknown> };

/** The drizzle handle bound to this request's transaction (as @payloadcms/drizzle resolves it). */
async function transactionDb(req: PayloadRequest): Promise<SqlRunner> {
  const adapter = req.payload.db as unknown as { sessions?: Record<string, { db: SqlRunner }>; drizzle: SqlRunner };
  const id = req.transactionID ? String(await req.transactionID) : null;
  return (id && adapter.sessions?.[id]?.db) || adapter.drizzle;
}

type JoinOutcome = "member" | "blocked" | "registration-closed" | "joined";

/**
 * Append one active membership for `site` to the reader in `req.user`.
 * Serialised per reader: the advisory lock is held until the transaction ends
 * and memberships are re-read inside it, so concurrent joins append one after
 * another. Existing rows pass through unchanged (row id, joinedAt, status);
 * the write runs as the reader under the MEMBER_JOIN authority, which the
 * Members hooks restrict to exactly this change.
 */
async function appendMembership(req: PayloadRequest, memberID: number | string, site: SiteDoc): Promise<JoinOutcome> {
  const shouldCommit = await initTransaction(req);
  try {
    const db = await transactionDb(req);
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`gildra:member-join:${memberID}`}))`);
    const fresh = await req.payload.findByID({ collection: "members", id: memberID, depth: 0, overrideAccess: true, req });
    const rows = (fresh.memberships ?? []) as { id?: string | null; site: number | { id: number }; status: "active" | "blocked"; joinedAt?: string | null }[];
    const existing = rows.find((m) => sameID(m.site, site.id));
    let outcome: JoinOutcome;
    if (existing) {
      outcome = existing.status === "active" ? "member" : "blocked";
    } else if (!site.registrationEnabled) {
      outcome = "registration-closed";
    } else {
      await req.payload.update({
        collection: "members",
        id: memberID,
        data: { memberships: [...rows, { site: site.id as number, status: "active" }] },
        overrideAccess: true,
        context: { [MEMBER_JOIN]: { member: memberID, site: site.id } },
        req,
      });
      outcome = "joined";
    }
    if (shouldCommit) await commitTransaction(req);
    return outcome;
  } catch (error) {
    await killTransaction(req);
    throw error;
  }
}

const join: Endpoint = {
  path: "/join",
  method: "post",
  handler: async (req) => {
    const member = asMember(req.user);
    if (!member) return json({ status: "unauthenticated" }, 401);
    const site = await findSite(req.payload, (await readJson(req)).site);
    if (!site) return json({ status: "unknown-site" }, 404);
    const outcome = await appendMembership(req, member.id, site);
    if (outcome === "blocked") return json({ status: "blocked" }, 403);
    if (outcome === "registration-closed") return json({ status: "registration-closed" }, 403);
    return json({ status: "member" });
  },
};

/** POST /api/members/site-forgot-password { site, email } — same answer whether or not the account exists. */
const siteForgotPassword: Endpoint = {
  path: "/site-forgot-password",
  method: "post",
  handler: async (req: PayloadRequest) => {
    const body = await readJson(req);
    const site = await findSite(req.payload, body.site);
    if (!site) return json({ status: "unknown-site" }, 404);
    if (emailMode() === "disabled") return json({ status: "unavailable", reason: "email-not-configured" }, 503);
    const email = normaliseEmail(body.email);
    if (rateLimited(`forgot:${clientKey(req)}`, 5, WINDOW)) return json({ status: "rate-limited" }, 429);
    if (email) {
      const { docs } = await req.payload.find({
        collection: "members",
        where: { and: [{ email: { equals: email } }, { "memberships.site": { equals: site.id } }, { blocked: { not_equals: true } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      if (docs[0]) {
        const forgotReq = await createLocalReq({ context: { [MEMBER_SITE]: site.id } }, req.payload);
        try {
          await req.payload.forgotPassword({ collection: "members", data: { email }, req: forgotReq });
        } catch (error) {
          req.payload.logger.error({ msg: "Password reset email failed", err: (error as Error).message });
          return json({ status: "unavailable", reason: "email-delivery-failed" }, 503);
        }
      }
    }
    return json({ status: "sent-if-exists" }, 202);
  },
};

export const memberEndpoints: Endpoint[] = [availability, register, siteLogin, session, join, siteForgotPassword];
