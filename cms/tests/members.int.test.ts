import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { capturedEmails, clearCapturedEmails } from "../src/email";
import { resetRateLimits } from "../src/utilities/http";
import { as, bootPayload, callEndpoint, makeStaff } from "./helpers/payload";

let payload: Payload;
let gildra: number;
let riftden: number;
type Staff = Awaited<ReturnType<typeof makeStaff>>;
let owner: Staff, gAdmin: Staff, rAdmin: Staff, gEditor: Staff;

const EMAIL = "new.reader@test.local";
const PASSWORD = "local-reader-pass-1";

const tokenFrom = (html: string) => decodeURIComponent(/token=([^"&<]+)/.exec(html)?.[1] ?? "");

async function memberDoc(email = EMAIL) {
  const { docs } = await payload.find({ collection: "members", where: { email: { equals: email } }, overrideAccess: true, depth: 0 });
  return { ...docs[0], collection: "members" as const };
}

async function authUser(token: string) {
  const { user } = await payload.auth({ headers: new Headers({ authorization: `JWT ${token}` }) });
  return user;
}

const register = (body: Record<string, unknown>) => callEndpoint(payload, "/register", "post", { body }, "members");
const siteLogin = (site: string, email = EMAIL, password = PASSWORD) =>
  callEndpoint(payload, "/site-login", "post", { body: { site, email, password } }, "members");

beforeAll(async () => {
  ({ payload } = await bootPayload("members"));
  const sites = await payload.find({ collection: "sites", overrideAccess: true, depth: 0 });
  gildra = sites.docs.find((s) => s.slug === "gildra")!.id;
  riftden = sites.docs.find((s) => s.slug === "riftden")!.id;
  owner = await makeStaff(payload, { email: "owner@test.local", owner: true });
  gAdmin = await makeStaff(payload, { email: "gadmin@test.local", sites: [{ site: gildra, role: "admin" }] });
  rAdmin = await makeStaff(payload, { email: "radmin@test.local", sites: [{ site: riftden, role: "admin" }] });
  gEditor = await makeStaff(payload, { email: "geditor@test.local", sites: [{ site: gildra, role: "editor" }] });
  clearCapturedEmails();
  resetRateLimits();
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("registration", () => {
  it("is closed until a site opts in, and honest when email is not configured", async () => {
    expect((await register({ site: "gildra", email: EMAIL, password: PASSWORD, displayName: "Reader" })).status).toBe(403);
    await payload.update({ collection: "sites", id: gildra, data: { registrationEnabled: true }, ...as(owner) });

    process.env.EMAIL_TRANSPORT = "smtp"; // without SMTP_HOST → not configured
    try {
      const unavailable = await register({ site: "gildra", email: EMAIL, password: PASSWORD, displayName: "Reader" });
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toEqual({ status: "unavailable", reason: "email-not-configured" });
      const availability = await callEndpoint(payload, "/availability", "get", { query: { site: "gildra" } }, "members");
      expect(availability.body.registration).toBe("unavailable");
    } finally {
      process.env.EMAIL_TRANSPORT = "capture";
    }
    expect(capturedEmails()).toHaveLength(0);
    expect((await payload.count({ collection: "members", overrideAccess: true })).totalDocs).toBe(0);
  });

  it("validates input and creates an unverified member with a server-set membership", async () => {
    expect((await register({ site: "gildra", email: "bad", password: "short", displayName: "" })).body.fields).toEqual(["email", "password", "displayName"]);
    const ok = await register({ site: "gildra", email: EMAIL, password: PASSWORD, displayName: "Reader One", memberships: [{ site: riftden }], blocked: false });
    expect(ok.status).toBe(202);
    expect(ok.body).toEqual({ status: "pending-verification" });

    const doc = await memberDoc();
    expect(doc._verified).toBe(false);
    expect(doc.memberships?.map((m) => [m.site, m.status])).toEqual([[gildra, "active"]]);

    const mails = capturedEmails();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(EMAIL);
    expect(mails[0].html).toContain("https://gildra.net/reader/verify?token=");

    const profile = await payload.find({ collection: "member-profiles", where: { member: { equals: doc.id } }, overrideAccess: true });
    expect(profile.docs[0]?.displayName).toBe("Reader One");
  });

  it("answers identically for an existing address and sends nothing", async () => {
    const again = await register({ site: "gildra", email: EMAIL.toUpperCase(), password: PASSWORD, displayName: "Dup" });
    expect(again.status).toBe(202);
    expect(again.body).toEqual({ status: "pending-verification" });
    expect(capturedEmails()).toHaveLength(1);
  });
});

describe("login, verification and sessions", () => {
  let token: string;

  it("refuses login before verification and verifies with the emailed token", async () => {
    expect((await siteLogin("gildra")).body.status).toBe("email-not-verified");
    const verifyToken = tokenFrom(capturedEmails()[0].html);
    expect(verifyToken.length).toBeGreaterThan(10);
    await payload.verifyEmail({ collection: "members", token: verifyToken });
    expect((await memberDoc())._verified).toBe(true);
  });

  it("logs in per site only where the membership is active", async () => {
    const login = await siteLogin("gildra");
    expect(login.status).toBe(200);
    token = login.body.token;
    expect((await authUser(token))?.collection).toBe("members");

    expect((await siteLogin("riftden")).status).toBe(401);
    expect((await siteLogin("gildra", EMAIL, "wrong-password-xx")).status).toBe(401);
    // Plain collection login has no site context and is refused.
    await expect(payload.login({ collection: "members", data: { email: EMAIL, password: PASSWORD } })).rejects.toThrow();

    const session = await callEndpoint(payload, "/session", "get", { user: await authUser(token), query: { site: "gildra" } }, "members");
    expect(session.body).toMatchObject({ authenticated: true, membership: "active", profile: { displayName: "Reader One" } });
    expect(session.raw).not.toContain(EMAIL);
  });

  it("whitelists self-service changes", async () => {
    const me = await authUser(token);
    for (const data of [
      { memberships: [{ site: gildra, status: "active" }, { site: riftden, status: "active" }] },
      { blocked: false },
      { email: "other@test.local" },
      { _verified: true },
      { password: "another-pass-123", memberships: [] },
    ]) {
      await expect(payload.update({ collection: "members", id: me!.id, data: data as never, ...as(me) })).rejects.toThrow();
    }
    await payload.update({ collection: "members", id: me!.id, data: { password: "changed-pass-123" } as never, ...as(me) });
    expect((await siteLogin("gildra", EMAIL, "changed-pass-123")).status).toBe(200);
    // Password changes are allowed; restore for the rest of the suite.
    await payload.update({ collection: "members", id: me!.id, data: { password: PASSWORD } as never, overrideAccess: true });

    const profile = (await payload.find({ collection: "member-profiles", where: { member: { equals: me!.id } }, overrideAccess: true })).docs[0];
    await payload.update({ collection: "member-profiles", id: profile.id, data: { displayName: "Renamed", bio: "Hi" }, ...as(me) });
    await expect(payload.update({ collection: "member-profiles", id: profile.id, data: { member: 999 } as never, ...as(me) })).rejects.toThrow();

    const other = await payload.create({
      collection: "members",
      data: { email: "other.reader@test.local", password: PASSWORD, _verified: true, memberships: [{ site: riftden, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    const otherProfile = await payload.create({ collection: "member-profiles", data: { member: other.id, handle: "other-reader", displayName: "Other" }, overrideAccess: true });
    await expect(payload.update({ collection: "member-profiles", id: otherProfile.id, data: { displayName: "x" }, ...as(me) })).rejects.toThrow();
    const visible = await payload.find({ collection: "members", ...as(me) });
    expect(visible.docs.map((d) => d.id)).toEqual([me!.id]);
  });

  it("keeps reader data private while public profiles stay public", async () => {
    await expect(payload.find({ collection: "members", overrideAccess: false })).rejects.toThrow();
    await expect(payload.find({ collection: "members", ...as(gEditor) })).rejects.toThrow();
    const anonProfiles = await payload.find({ collection: "member-profiles", overrideAccess: false });
    expect(anonProfiles.docs.length).toBeGreaterThan(0);
    expect(anonProfiles.docs.every((p) => p.member === undefined)).toBe(true);
    const handle = anonProfiles.docs[0].handle;
    const pub = await callEndpoint(payload, "/public/profiles/:handle", "get", { params: { handle } });
    expect(pub.status).toBe(200);
    expect(pub.raw).not.toMatch(/@test\.local|memberships|blocked/);
  });

  it("lets site admins manage only their own site's memberships; blocking ends sessions", async () => {
    const doc = await memberDoc();
    const rView = await payload.find({ collection: "members", ...as(rAdmin) });
    expect(rView.docs.map((d) => d.id)).not.toContain(doc.id);
    await expect(
      payload.update({ collection: "members", id: doc.id, data: { memberships: [{ site: gildra, status: "blocked" }] } as never, ...as(rAdmin) }),
    ).rejects.toThrow();
    // Site admin may not touch fields outside memberships, nor rows of other sites.
    await expect(payload.update({ collection: "members", id: doc.id, data: { blocked: true } as never, ...as(gAdmin) })).rejects.toThrow();
    await expect(
      payload.update({
        collection: "members",
        id: doc.id,
        data: { memberships: [{ site: gildra, status: "active" }, { site: riftden, status: "active" }] } as never,
        ...as(gAdmin),
      }),
    ).rejects.toThrow();

    const login = await siteLogin("gildra");
    const liveToken = login.body.token;
    expect(await authUser(liveToken)).toBeTruthy();

    await payload.update({ collection: "members", id: doc.id, data: { memberships: [{ site: gildra, status: "blocked" }] } as never, ...as(gAdmin) });
    expect(await authUser(liveToken)).toBeNull();
    expect((await siteLogin("gildra")).status).toBe(401);

    const audit = await payload.find({ collection: "audit-log", where: { and: [{ targetCollection: { equals: "members" } }, { targetId: { equals: String(doc.id) } }] }, overrideAccess: true });
    expect(audit.docs.some((d) => d.actorEmail === "gadmin@test.local")).toBe(true);

    await payload.update({ collection: "members", id: doc.id, data: { memberships: [{ site: gildra, status: "active" }] } as never, ...as(gAdmin) });
    expect((await siteLogin("gildra")).status).toBe(200);
  });

  it("global block by the owner closes every site and hides the public profile", async () => {
    const doc = await memberDoc();
    await payload.update({ collection: "members", id: doc.id, data: { blocked: true } as never, ...as(owner) });
    expect((await siteLogin("gildra")).status).toBe(401);
    const profile = (await payload.find({ collection: "member-profiles", where: { member: { equals: doc.id } }, overrideAccess: true })).docs[0];
    expect((await callEndpoint(payload, "/public/profiles/:handle", "get", { params: { handle: profile.handle } })).status).toBe(404);
    await payload.update({ collection: "members", id: doc.id, data: { blocked: false } as never, ...as(owner) });
  });
});

describe("password reset", () => {
  it("sends a site-specific link and answers the same for unknown addresses", async () => {
    clearCapturedEmails();
    const unknown = await callEndpoint(payload, "/site-forgot-password", "post", { body: { site: "gildra", email: "nobody@test.local" } }, "members");
    expect(unknown.status).toBe(202);
    expect(capturedEmails()).toHaveLength(0);

    const known = await callEndpoint(payload, "/site-forgot-password", "post", { body: { site: "gildra", email: EMAIL } }, "members");
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const mail = capturedEmails()[0];
    expect(mail.html).toContain("https://gildra.net/reader/reset-password?token=");
    await payload.resetPassword({ collection: "members", data: { token: tokenFrom(mail.html), password: "reset-pass-12345" }, overrideAccess: true });
    expect((await siteLogin("gildra", EMAIL, "reset-pass-12345")).status).toBe(200);
  });

  it("refuses reset emails when delivery is not configured", async () => {
    process.env.EMAIL_TRANSPORT = "disabled";
    try {
      const res = await callEndpoint(payload, "/site-forgot-password", "post", { body: { site: "gildra", email: EMAIL } }, "members");
      expect(res.status).toBe(503);
      await expect(payload.forgotPassword({ collection: "members", data: { email: EMAIL } })).rejects.toThrow(/not configured/);
    } finally {
      process.env.EMAIL_TRANSPORT = "capture";
    }
  });
});

describe("membership administration boundaries", () => {
  it("lets only admins of the reader's site (or owners) unlock a locked account", async () => {
    const locked = await payload.create({
      collection: "members",
      data: { email: "locked.reader@test.local", password: PASSWORD, _verified: true, memberships: [{ site: riftden, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    const lock = () =>
      payload.update({
        collection: "members",
        id: locked.id,
        data: { loginAttempts: 5, lockUntil: new Date(Date.now() + 3600_000).toISOString() } as never,
        overrideAccess: true,
      });
    const lockState = async () => (await payload.findByID({ collection: "members", id: locked.id, overrideAccess: true, showHiddenFields: true })).lockUntil ?? null;
    await lock();
    expect(await lockState()).not.toBeNull();

    await expect(payload.unlock({ collection: "members", data: { email: "locked.reader@test.local" }, overrideAccess: false, user: gAdmin } as never)).rejects.toThrow();
    await expect(payload.unlock({ collection: "members", data: { email: "locked.reader@test.local" }, overrideAccess: false, user: gEditor } as never)).rejects.toThrow();
    expect(await lockState()).not.toBeNull();

    await payload.unlock({ collection: "members", data: { email: "locked.reader@test.local" }, overrideAccess: false, user: rAdmin } as never);
    expect(await lockState()).toBeNull();

    await lock();
    await payload.unlock({ collection: "members", data: { email: "locked.reader@test.local" }, overrideAccess: false, user: owner } as never);
    expect(await lockState()).toBeNull();
  });

  it("joins keep existing membership rows and survive concurrent requests", async () => {
    const third = await payload.create({
      collection: "sites",
      data: { name: "Third", slug: "third", domain: "third.test", game: "wow", publicUrl: "https://third.test", registrationEnabled: true, languages: ["en"] } as never,
      ...as(owner),
    });
    await payload.update({ collection: "sites", id: gildra, data: { registrationEnabled: true }, ...as(owner) });
    const joinedAt = "2026-01-01T00:00:00.000Z";
    const reader = await payload.create({
      collection: "members",
      data: { email: "joiner@test.local", password: PASSWORD, _verified: true, memberships: [{ site: riftden, status: "active", joinedAt }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    const original = (await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true, depth: 0 })).memberships![0];
    expect(original.joinedAt).toBe(joinedAt);

    const user = { ...(await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true, depth: 0 })), collection: "members" as const };
    const [a, b] = await Promise.all([
      callEndpoint(payload, "/join", "post", { user, body: { site: "gildra" } }, "members"),
      callEndpoint(payload, "/join", "post", { user, body: { site: "third" } }, "members"),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);

    const after = (await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true, depth: 0 })).memberships!;
    expect(after).toHaveLength(3);
    expect(after[0]).toMatchObject({ id: original.id, site: riftden, status: "active", joinedAt });
    expect(new Set(after.map((m) => m.site))).toEqual(new Set([riftden, gildra, third.id]));
    expect(after.slice(1).every((m) => m.status === "active" && m.joinedAt && m.joinedAt !== joinedAt)).toBe(true);

    // Joining again is idempotent and reports the current state.
    const again = await callEndpoint(payload, "/join", "post", { user, body: { site: "gildra" } }, "members");
    expect(again.body).toEqual({ status: "member" });
    expect((await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true, depth: 0 })).memberships).toHaveLength(3);

    // The bounded write is audited as the reader.
    const audit = await payload.find({
      collection: "audit-log",
      where: { and: [{ targetCollection: { equals: "members" } }, { targetId: { equals: String(reader.id) } }, { action: { equals: "members.update" } }] },
      overrideAccess: true,
    });
    expect(audit.docs.length).toBeGreaterThanOrEqual(2);
    expect(audit.docs.every((d) => d.actorCollection === "members" && d.actorId === String(reader.id))).toBe(true);

    // The join authority does not widen direct self-service updates.
    await expect(
      payload.update({ collection: "members", id: reader.id, data: { memberships: [...after, { site: third.id, status: "active" }] } as never, ...as(user) }),
    ).rejects.toThrow();
    await expect(
      payload.update({
        collection: "members",
        id: reader.id,
        data: { memberships: after.slice(1) } as never,
        context: { "gildra:memberJoin": { member: reader.id, site: gildra } },
        ...as(user),
      }),
    ).rejects.toThrow();
  });
});

describe("credential-confirmed enrollment on a second site", () => {
  const enrollLogin = (site: string, email: string, password: string, enroll?: boolean) =>
    callEndpoint(payload, "/site-login", "post", { body: { site, email, password, ...(enroll === undefined ? {} : { enroll }) } }, "members");

  it("offers and performs opt-in enrollment only after the password is confirmed", async () => {
    resetRateLimits();
    const email = "network.reader@test.local";
    const joinedAt = "2026-02-01T00:00:00.000Z";
    const reader = await payload.create({
      collection: "members",
      data: { email, password: PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active", joinedAt }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });

    // Registration closed on Riftden: nothing is revealed.
    await payload.update({ collection: "sites", id: riftden, data: { registrationEnabled: false }, ...as(owner) });
    expect((await enrollLogin("riftden", email, PASSWORD)).body).toEqual({ status: "invalid-credentials" });
    expect((await enrollLogin("riftden", email, PASSWORD, true)).status).toBe(401);

    await payload.update({ collection: "sites", id: riftden, data: { registrationEnabled: true }, ...as(owner) });
    // Wrong password: no hint that the account exists, no enrollment.
    expect((await enrollLogin("riftden", email, "wrong-password-xx")).body).toEqual({ status: "invalid-credentials" });
    expect((await enrollLogin("riftden", email, "wrong-password-xx", true)).status).toBe(401);
    // Right password, no membership: offered, not performed.
    const offer = await enrollLogin("riftden", email, PASSWORD);
    expect(offer.status).toBe(409);
    expect(offer.body).toEqual({ status: "enrollment-available" });
    expect((await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true })).memberships).toHaveLength(1);

    const enrolled = await enrollLogin("riftden", email, PASSWORD, true);
    expect(enrolled.status).toBe(200);
    expect(enrolled.body).toMatchObject({ status: "ok", enrolled: true });
    expect(await authUser(enrolled.body.token)).toBeTruthy();
    const rows = (await payload.findByID({ collection: "members", id: reader.id, overrideAccess: true, depth: 0 })).memberships!;
    expect(rows.map((r) => [r.site, r.status])).toEqual([
      [gildra, "active"],
      [riftden, "active"],
    ]);
    expect(rows[0].joinedAt).toBe(joinedAt);
    const audit = await payload.find({
      collection: "audit-log",
      where: { and: [{ targetId: { equals: String(reader.id) } }, { action: { equals: "members.update" } }] },
      overrideAccess: true,
    });
    expect(audit.docs.some((d) => d.actorCollection === "members" && d.actorId === String(reader.id))).toBe(true);

    // Normal login on the new site now works without the flag.
    expect((await enrollLogin("riftden", email, PASSWORD)).body).toMatchObject({ status: "ok", enrolled: false });
  });

  it("never re-activates a blocked membership and never enrolls unverified accounts", async () => {
    resetRateLimits();
    const blocked = await payload.create({
      collection: "members",
      data: { email: "blocked.rift@test.local", password: PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active" }, { site: riftden, status: "blocked" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    expect((await enrollLogin("riftden", "blocked.rift@test.local", PASSWORD, true)).body).toEqual({ status: "invalid-credentials" });
    const after = (await payload.findByID({ collection: "members", id: blocked.id, overrideAccess: true, depth: 0 })).memberships!;
    expect(after.find((r) => r.site === riftden)?.status).toBe("blocked");

    await payload.create({
      collection: "members",
      data: { email: "unverified.rift@test.local", password: PASSWORD, memberships: [{ site: gildra, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    expect((await enrollLogin("riftden", "unverified.rift@test.local", PASSWORD, true)).body).toEqual({ status: "email-not-verified" });
  });
});

describe("site-login error mapping", () => {
  it("reports a locked account as locked (class check, safe under minified production builds)", async () => {
    resetRateLimits();
    const locked = await payload.create({
      collection: "members",
      data: { email: "locked.login@test.local", password: PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    await payload.update({ collection: "members", id: locked.id, data: { loginAttempts: 5, lockUntil: new Date(Date.now() + 3600_000).toISOString() } as never, overrideAccess: true });
    const res = await callEndpoint(payload, "/site-login", "post", { body: { site: "gildra", email: "locked.login@test.local", password: PASSWORD } }, "members");
    expect(res.status).toBe(423);
    expect(res.body).toEqual({ status: "locked" });
  });
});
