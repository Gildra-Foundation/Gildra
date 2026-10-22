import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { peopleData } from "../src/people/data";
import { articlesData } from "../src/articles/data";
import { publishedArticleLinks } from "../src/articles/publishedLinks";
import { profilesForPage } from "../src/access/profilePage";
import { as, bootPayload, callEndpoint, lexical, makeStaff, TEST_PASSWORD } from "./helpers/payload";

let payload: Payload;
let gildra: number, riftden: number;
type Staff = Awaited<ReturnType<typeof makeStaff>>;
let owner: Staff, mixed: Staff, gAdmin: Staff, rEditor: Staff, author: Staff;
let firstMember: { id: number; collection: "members"; email: string };
let dualMember: number;
let foreignMember: number;
let publishedID: number;
const req = (user?: unknown): Promise<PayloadRequest> => createLocalReq({ user: user as never, locale: "en" }, payload);

beforeAll(async () => {
  ({ payload } = await bootPayload("workflows"));
  const sites = await payload.find({ collection: "sites", overrideAccess: true });
  gildra = sites.docs.find((s) => s.slug === "gildra")!.id;
  riftden = sites.docs.find((s) => s.slug === "riftden")!.id;
  owner = await makeStaff(payload, { email: "owner@workflow.test", owner: true });
  const member = await payload.create({ collection: "members", overrideAccess: true,
    data: { email: "first@workflow.test", password: TEST_PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active" }] } as never });
  firstMember = { id: member.id, email: member.email, collection: "members" };
  mixed = await makeStaff(payload, { email: "mixed@workflow.test", sites: [{ site: gildra, role: "editor" }, { site: riftden, role: "author" }] });
  gAdmin = await makeStaff(payload, { email: "gadmin@workflow.test", sites: [{ site: gildra, role: "admin" }] });
  rEditor = await makeStaff(payload, { email: "private-riftden@workflow.test", sites: [{ site: riftden, role: "editor" }] });
  author = await makeStaff(payload, { email: "author@workflow.test", sites: [{ site: gildra, role: "author" }] });
  const dual = await payload.create({ collection: "members", overrideAccess: true,
    data: { email: "dual@workflow.test", password: TEST_PASSWORD, _verified: true,
      memberships: [{ site: gildra, status: "active" }, { site: riftden, status: "blocked" }] } as never });
  dualMember = dual.id;
  const foreign = await payload.create({ collection: "members", overrideAccess: true,
    data: { email: "riftden-only@workflow.test", password: TEST_PASSWORD, _verified: true, memberships: [{ site: riftden, status: "active" }] } as never });
  foreignMember = foreign.id;
  await payload.create({ collection: "member-profiles", overrideAccess: true,
    data: { member: dualMember, handle: "dual-reader", displayName: "Reader Name" } });
  await payload.create({ collection: "member-profiles", overrideAccess: true,
    data: { member: foreignMember, handle: "foreign-reader", displayName: "Public Foreign Reader" } });
});

afterAll(async () => { await payload?.db.destroy?.(); });

describe("staff authentication and identity boundaries", () => {
  it("does not confuse equal staff/reader IDs when exposing sessions", async () => {
    expect(firstMember.id).toBe(owner.id);
    const adminLogin = await payload.login({ collection: "admins", data: { email: owner.email, password: TEST_PASSWORD } });
    const memberLogin = await callEndpoint(payload, "/site-login", "post", { body: { site: "gildra", email: firstMember.email, password: TEST_PASSWORD } }, "members");
    expect(memberLogin.status).toBe(200);
    const { user: actualMember } = await payload.auth({ headers: new Headers({ authorization: `JWT ${memberLogin.body.token}` }) });
    const { user: actualAdmin } = await payload.auth({ headers: new Headers({ authorization: `JWT ${adminLogin.token}` }) });
    expect(actualMember?.collection).toBe("members");
    expect(actualAdmin?.collection).toBe("admins");
    const other = await payload.findByID({ collection: "members", id: firstMember.id, ...as(owner), depth: 0 });
    // Payload normalizes an unreadable array to []; no session IDs may survive.
    expect(other.sessions ?? []).toEqual([]);
    const selfReader = await payload.findByID({ collection: "members", id: firstMember.id, ...as(actualMember), depth: 0 });
    const selfStaff = await payload.findByID({ collection: "admins", id: owner.id, ...as(actualAdmin), depth: 0 });
    expect(selfReader.sessions?.length).toBeGreaterThan(0);
    expect(selfStaff.sessions?.length).toBeGreaterThan(0);
  });

  it("answers identically for known/unknown recovery addresses when email is disabled", async () => {
    process.env.EMAIL_TRANSPORT = "disabled";
    try {
      const errors = [];
      for (const email of [owner.email, "absent@workflow.test"]) {
        try { await payload.forgotPassword({ collection: "admins", data: { email } }); }
        catch (error) { errors.push({ status: (error as { status: number }).status, message: (error as Error).message }); }
      }
      expect(errors).toHaveLength(2);
      expect(errors[0]).toEqual(errors[1]);
      expect(errors[0].status).toBe(503);
    } finally { process.env.EMAIL_TRANSPORT = "capture"; }
  });

  it("mixed editor/author roles do not expose staff from the author-only site", async () => {
    const result = await peopleData(await req(mixed), {});
    expect(result.rows.some((row) => row.id === String(mixed.id))).toBe(true);
    expect(result.rows.some((row) => row.id === String(gAdmin.id))).toBe(true);
    expect(result.rows.some((row) => row.id === String(rEditor.id))).toBe(false);
    await expect(payload.findByID({ collection: "admins", id: rEditor.id, ...as(mixed) })).rejects.toThrow();
  });
});

describe("people registry and tenant-scoped DTOs", () => {
  it("owners see all readers; site admins see only their readers and site memberships", async () => {
    const all = await peopleData(await req(owner), { kind: "readers" });
    expect(all.totalDocs).toBe(3);
    const local = await peopleData(await req(gAdmin), { kind: "readers" });
    expect(local.totalDocs).toBe(2);
    const dual = local.rows.find((row) => row.id === String(dualMember))!;
    expect(dual.sites).toEqual([{ name: "Gildra", role: "active" }]);
    expect(dual.name).toBe("Reader Name");
    expect(dual.blocked).toBe(false); // Readable by staff; changing it stays owner-only.
    const serialized = JSON.stringify(local);
    for (const secret of ["sessions", "hash", "salt", "resetPasswordToken", "_verificationToken"]) expect(serialized).not.toContain(`"${secret}"`);
    expect(serialized).not.toContain("riftden-only@workflow.test");
  });

  it("denies reader registry to editors/authors and anonymous users", async () => {
    for (const user of [mixed, author, firstMember, undefined]) await expect(peopleData(await req(user), { kind: "readers" })).rejects.toThrow();
    const own = await peopleData(await req(author), {});
    expect(own.rows.map((row) => row.id)).toEqual([String(author.id)]);
  });

  it("rejects forged site filters and searches the permitted dataset", async () => {
    await expect(peopleData(await req(gAdmin), { kind: "readers", site: String(riftden) })).rejects.toThrow();
    const result = await peopleData(await req(gAdmin), { kind: "readers", q: "dual@" });
    expect(result.totalDocs).toBe(1);
    expect(result.rows[0].id).toBe(String(dualMember));
  });

  it("saves a native site-admin form while preserving immutable account values and foreign rows", async () => {
    const original = await payload.findByID({ collection: "members", id: dualMember, depth: 0, overrideAccess: true });
    const memberships = original.memberships!.map((row) => row.site === gildra ? { ...row, status: "blocked" as const } : row);
    const form = { id: original.id, email: original.email, _verified: original._verified, blocked: original.blocked,
      blockedReason: original.blockedReason, createdAt: original.createdAt, updatedAt: original.updatedAt, memberships };
    await payload.update({ collection: "members", id: dualMember, data: form as never, ...as(gAdmin) });
    const saved = await payload.findByID({ collection: "members", id: dualMember, depth: 0, overrideAccess: true });
    expect(saved.memberships!.find((row) => row.site === gildra)?.status).toBe("blocked");
    expect(saved.memberships!.find((row) => row.site === riftden)).toEqual(original.memberships!.find((row) => row.site === riftden));
    for (const patch of [{ email: "changed@workflow.test" }, { _verified: false }, { blocked: true }, { blockedReason: "Changed" },
      { id: 999 }, { createdAt: "2000-01-01T00:00:00.000Z" }, { updatedAt: "2000-01-01T00:00:00.000Z" }, { password: "unsafe-reset" }]) {
      await expect(payload.update({ collection: "members", id: dualMember, data: { memberships: saved.memberships, ...patch } as never, ...as(gAdmin) })).rejects.toThrow();
    }
    for (const change of [{ joinedAt: "2000-01-01T00:00:00.000Z" }, { id: "forged-row" }]) {
      await expect(payload.update({ collection: "members", id: dualMember,
        data: { memberships: saved.memberships!.map((row) => row.site === riftden ? { ...row, ...change } : row) } as never, ...as(gAdmin) })).rejects.toThrow();
    }
  });

  it("hides blocked public profiles and exposes member IDs only to self or permitted moderators", async () => {
    const foreign = (await payload.find({ collection: "member-profiles", where: { member: { equals: foreignMember } }, overrideAccess: true })).docs[0];
    for (const user of [undefined, mixed, gAdmin]) {
      const doc = await payload.findByID({ collection: "member-profiles", id: foreign.id, ...as(user), depth: 0 });
      expect(doc).not.toHaveProperty("member");
    }
    const ownSite = (await payload.find({ collection: "member-profiles", where: { member: { equals: dualMember } }, overrideAccess: true })).docs[0];
    expect((await payload.findByID({ collection: "member-profiles", id: ownSite.id, ...as(gAdmin), depth: 0 })).member).toBe(dualMember);
    await payload.update({ collection: "members", id: foreignMember, data: { blocked: true }, ...as(owner) });
    const publicList = await payload.find({ collection: "member-profiles", ...as(undefined), depth: 0 });
    expect(publicList.docs.some((doc) => doc.id === foreign.id)).toBe(false);
    expect((await payload.findByID({ collection: "member-profiles", id: foreign.id, ...as(owner) })).id).toBe(foreign.id);
  });

  it("keeps server profile lookup bounded without making private member queries public", async () => {
    const request = await req(gAdmin);
    const profiles = await profilesForPage(request, [dualMember]);
    expect(profiles.map((profile) => profile.member)).toEqual([dualMember]);
    await expect(payload.find({ collection: "member-profiles", req: request, ...as(gAdmin),
      where: { member: { equals: foreignMember } } })).rejects.toThrow();
    const ownerPage = await profilesForPage(await req(owner), [dualMember]);
    expect(ownerPage.map((profile) => profile.member)).toEqual([dualMember]);
    await expect(profilesForPage(request, Array(26).fill(dualMember))).rejects.toThrow("Invalid profile page size");
  });
});

describe("articles and published links", () => {
  it("keeps draft text and slug separate from actual published links", async () => {
    const doc = await payload.create({ collection: "guides", locale: "en", overrideAccess: true,
      data: { site: gildra, slug: "live-original", title: "Published English", summary: "Public summary", content: lexical("Public body"), _status: "published" } as never });
    publishedID = doc.id;
    await payload.update({ collection: "guides", id: doc.id, locale: "ru", draft: true, ...as(owner),
      data: { slug: "draft-changed", title: "Черновой перевод", summary: "Описание", content: lexical("Черновой текст"), _status: "draft" } as never });
    const links = await publishedArticleLinks(await req(owner), String(doc.id));
    expect(links).toEqual([{ code: "en", short: "EN", url: "https://gildra.net/wow/articles/live-original" }]);
    const workbench = await articlesData(await req(owner), { locale: "en" });
    const row = workbench.rows.find((item) => item.id === String(doc.id))!;
    expect(row.status).toBe("draft");
    expect(row.live).toBe(true);
    expect(row.liveUrl).toBe("https://gildra.net/wow/articles/live-original");
    const russian = await articlesData(await req(owner), { locale: "ru" });
    expect(russian.rows.find((item) => item.id === String(doc.id))?.liveUrl).toBeNull();
  });

  it("paginates on the server and searches beyond the current page", async () => {
    for (let n = 0; n < 26; n++) await payload.create({ collection: "guides", locale: "en", overrideAccess: true,
      data: { site: gildra, slug: `paging-${n}`, title: `Article ${n}`, summary: "Summary", content: lexical("Body"), _status: "draft" } as never });
    const page = await articlesData(await req(owner), { page: "2", locale: "en" });
    expect(page.totalDocs).toBe(27);
    expect(page.rows.length).toBe(2);
    const search = await articlesData(await req(owner), { q: "draft-changed", locale: "ru" });
    expect(search.totalDocs).toBe(1);
    expect(search.rows[0].id).toBe(String(publishedID));
    await expect(articlesData(await req(author), { site: String(riftden) })).rejects.toThrow();
    await expect(articlesData(await req(firstMember), {})).rejects.toThrow();
  });
});
