import { commitTransaction, createLocalReq, initTransaction, killTransaction, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pbkdf2Sync, randomBytes } from "node:crypto";

import { withClient } from "./helpers/db";
import { as, bootPayload, callEndpoint, makeStaff } from "./helpers/payload";

let payload: Payload;
let url: string;
let gildra: number;
type Staff = Awaited<ReturnType<typeof makeStaff>>;
let owner: Staff, gAdmin: Staff;

const PASSWORD = "local-reader-pass-1";

async function readerWithProfile(email: string, handle: string) {
  const member = await payload.create({
    collection: "members",
    data: { email, password: PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active" }] } as never,
    overrideAccess: true,
    disableVerificationEmail: true,
  });
  const profile = await payload.create({ collection: "member-profiles", data: { member: member.id, handle, displayName: handle }, overrideAccess: true });
  return { member: { ...member, collection: "members" as const }, profile };
}

const exists = async (collection: "members" | "member-profiles", id: number | string) =>
  (await payload.count({ collection, where: { id: { equals: id } }, overrideAccess: true })).totalDocs === 1;

beforeAll(async () => {
  ({ payload, url } = await bootPayload("lifecycle"));
  gildra = (await payload.find({ collection: "sites", where: { slug: { equals: "gildra" } }, overrideAccess: true })).docs[0].id;
  owner = await makeStaff(payload, { email: "owner@test.local", owner: true });
  gAdmin = await makeStaff(payload, { email: "gadmin@test.local", sites: [{ site: gildra, role: "admin" }] });
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

describe("reader account deletion", () => {
  it("lets the owner delete an account together with its public profile", async () => {
    const { member, profile } = await readerWithProfile("delete.me@test.local", "delete-me");
    await payload.delete({ collection: "members", id: member.id, ...as(owner) });
    expect(await exists("members", member.id)).toBe(false);
    expect(await exists("member-profiles", profile.id)).toBe(false);
    const audit = await payload.find({ collection: "audit-log", where: { and: [{ action: { equals: "members.delete" } }, { targetId: { equals: String(member.id) } }] }, overrideAccess: true });
    expect(audit.totalDocs).toBe(1);
  });

  it("keeps account deletion owner-only (site admins and readers cannot)", async () => {
    const { member, profile } = await readerWithProfile("keep.me@test.local", "keep-me");
    await expect(payload.delete({ collection: "members", id: member.id, ...as(gAdmin) })).rejects.toThrow();
    await expect(payload.delete({ collection: "members", id: member.id, ...as(member) })).rejects.toThrow();
    expect(await exists("members", member.id)).toBe(true);
    expect(await exists("member-profiles", profile.id)).toBe(true);
    // A reader may still remove only their own profile, not the account.
    await payload.delete({ collection: "member-profiles", id: profile.id, ...as(member) });
    expect(await exists("member-profiles", profile.id)).toBe(false);
    expect(await exists("members", member.id)).toBe(true);
  });

  it("runs in the caller's transaction: a rolled-back delete keeps both records", async () => {
    const { member, profile } = await readerWithProfile("rollback@test.local", "rollback-me");
    const req = await createLocalReq({ user: owner as never }, payload);
    await initTransaction(req);
    await payload.delete({ collection: "members", id: member.id, overrideAccess: false, req });
    await killTransaction(req);
    expect(await exists("members", member.id)).toBe(true);
    expect(await exists("member-profiles", profile.id)).toBe(true);

    const commitReq = await createLocalReq({ user: owner as never }, payload);
    await initTransaction(commitReq);
    await payload.delete({ collection: "members", id: member.id, overrideAccess: false, req: commitReq });
    await commitTransaction(commitReq);
    expect(await exists("members", member.id)).toBe(false);
    expect(await exists("member-profiles", profile.id)).toBe(false);
  });

  it("deletes accounts without a profile and in bulk", async () => {
    const lone = await payload.create({
      collection: "members",
      data: { email: "no.profile@test.local", password: PASSWORD, _verified: true, memberships: [{ site: gildra, status: "active" }] } as never,
      overrideAccess: true,
      disableVerificationEmail: true,
    });
    const a = await readerWithProfile("bulk.a@test.local", "bulk-a");
    const b = await readerWithProfile("bulk.b@test.local", "bulk-b");
    await payload.delete({ collection: "members", id: lone.id, ...as(owner) });
    const result = await payload.delete({ collection: "members", where: { email: { like: "bulk." } }, ...as(owner) });
    expect(result.errors).toEqual([]);
    for (const id of [lone.id, a.member.id, b.member.id]) expect(await exists("members", id)).toBe(false);
    for (const id of [a.profile.id, b.profile.id]) expect(await exists("member-profiles", id)).toBe(false);
  });
});

describe("password hashes after the Payload 3.90 upgrade (GHSA-q6mq-ch85-c8mm)", () => {
  /** A hash exactly as Payload <= 3.89 stored it: PBKDF2-SHA256, 25 000 iterations, 512-byte key, hex. */
  const legacyHash = (password: string) => {
    const salt = randomBytes(32).toString("hex");
    return { salt, hash: pbkdf2Sync(password, salt, 25_000, 512, "sha256").toString("hex") };
  };
  const stored = (table: string, id: number | string) =>
    withClient(url, async (c) => (await c.query(`SELECT salt, hash FROM "${table}" WHERE id = $1`, [id])).rows[0] as { salt: string; hash: string });

  it("logs legacy staff in and upgrades the hash transparently", async () => {
    const staff = await makeStaff(payload, { email: "legacy.staff@test.local", sites: [{ site: gildra, role: "editor" }] });
    const old = legacyHash("legacy-staff-password");
    await withClient(url, (c) => c.query(`UPDATE admins SET salt = $1, hash = $2 WHERE id = $3`, [old.salt, old.hash, staff.id]));

    await expect(payload.login({ collection: "admins", data: { email: "legacy.staff@test.local", password: "wrong-password-0" } })).rejects.toThrow();
    expect((await stored("admins", staff.id)).hash).toBe(old.hash);

    const result = await payload.login({ collection: "admins", data: { email: "legacy.staff@test.local", password: "legacy-staff-password" } });
    expect(result.token).toBeTruthy();
    const after = await stored("admins", staff.id);
    expect(after.hash.startsWith("pbkdf2-sha256-v1:")).toBe(true);
    expect(after.hash).not.toBe(old.hash);
    // The upgraded hash keeps working.
    expect((await payload.login({ collection: "admins", data: { email: "legacy.staff@test.local", password: "legacy-staff-password" } })).token).toBeTruthy();
  });

  it("upgrades a legacy reader hash through site login", async () => {
    const { member } = await readerWithProfile("legacy.reader@test.local", "legacy-reader");
    const old = legacyHash("legacy-reader-pass");
    await withClient(url, (c) => c.query(`UPDATE members SET salt = $1, hash = $2 WHERE id = $3`, [old.salt, old.hash, member.id]));
    const res = await callEndpoint(payload, "/site-login", "post", { body: { site: "gildra", email: "legacy.reader@test.local", password: "legacy-reader-pass" } }, "members");
    expect(res.status).toBe(200);
    expect((await stored("members", member.id)).hash.startsWith("pbkdf2-sha256-v1:")).toBe(true);
  });
});
