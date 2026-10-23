import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_IMAGE_SIDE, SVG_REJECTED } from "../src/collections/Media";
import { csrfOrigins, staffCookies } from "../src/security/origin";
import { bootPayload, makeStaff, TEST_PASSWORD } from "./helpers/payload";
import sharp from "sharp";

let payload: Payload;
let site: number;
let owner: Awaited<ReturnType<typeof makeStaff>>;

beforeAll(async () => {
  ({ payload } = await bootPayload("security"));
  site = (await payload.find({ collection: "sites", overrideAccess: true, depth: 0 })).docs[0]!.id;
  owner = await makeStaff(payload, { email: "owner@test.local", owner: true });
});

afterAll(async () => {
  await payload?.db.destroy?.();
});

const login = (email: string, password: string) =>
  payload.login({ collection: "admins", data: { email, password } });

describe("staff auth hardening", () => {
  it("declares explicit lockout and token settings", () => {
    const auth = payload.collections.admins.config.auth;
    expect(auth.maxLoginAttempts).toBe(5);
    expect(auth.lockTime).toBe(15 * 60 * 1000);
    expect(auth.tokenExpiration).toBe(12 * 60 * 60);
    expect(auth.cookies.sameSite).toBe("Lax");
  });

  it("locks the account after five wrong passwords, even for the right one", async () => {
    const staff = await makeStaff(payload, { email: "locked@test.local" });
    for (let i = 0; i < 5; i++) await expect(login(staff.email, "wrong-password")).rejects.toThrow();
    await expect(login(staff.email, TEST_PASSWORD)).rejects.toThrow(/заблокирован|locked/i);
  });

  it("lets an owner unlock the account", async () => {
    await payload.unlock({ collection: "admins", data: { email: "locked@test.local" }, overrideAccess: false, user: owner as never });
    const ok = await login("locked@test.local", TEST_PASSWORD);
    expect(ok.token).toBeTruthy();
  });

  it("marks the cookie Secure on https origins only and allows only the CMS origin for CSRF", () => {
    const prev = process.env.PAYLOAD_PUBLIC_URL;
    process.env.PAYLOAD_PUBLIC_URL = "https://cms.gildra.net/admin";
    expect(staffCookies()).toEqual({ secure: true, sameSite: "Lax" });
    expect(csrfOrigins()).toEqual(["https://cms.gildra.net"]);
    process.env.PAYLOAD_PUBLIC_URL = "http://localhost:3001";
    expect(staffCookies().secure).toBe(false);
    if (prev === undefined) delete process.env.PAYLOAD_PUBLIC_URL;
    else process.env.PAYLOAD_PUBLIC_URL = prev;
    expect([...new Set(payload.config.csrf)]).toEqual(csrfOrigins());
  });
});

describe("media upload limits", () => {
  const upload = (file: { data: Buffer; mimetype: string; name: string }) =>
    payload.create({
      collection: "media",
      data: { alt: "x", site } as never,
      file: { ...file, size: file.data.length },
      overrideAccess: true,
    });

  it("explains an SVG rejection in Russian and English", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(upload({ data: svg, mimetype: "image/svg+xml", name: "x.svg" })).rejects.toThrow(SVG_REJECTED);
    await expect(upload({ data: svg, mimetype: "application/octet-stream", name: "x.SVG" })).rejects.toThrow(/SVG не поддерживается/);
  });

  it("refuses images beyond the maximum side", async () => {
    const wide = await sharp({ create: { width: MAX_IMAGE_SIDE + 1, height: 1, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(upload({ data: wide, mimetype: "image/png", name: "wide.png" })).rejects.toThrow(/слишком большое/);
  });

  it("configures a 25 MB upload limit", () => {
    expect(payload.config.upload.limits?.fileSize).toBe(25 * 1024 * 1024);
  });
});
