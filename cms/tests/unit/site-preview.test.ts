import { beforeAll, describe, expect, it } from "vitest";

import { sitePreviewUrl } from "../../src/admin/sitePaths";
import { nativePreviewSites } from "../../src/preview/sitePreview";
import { SITE_PREVIEW_WINDOW_SECONDS, signSitePreview, verifyPreview } from "../../src/preview/token";

beforeAll(() => {
  process.env.PAYLOAD_SECRET ||= "local-test-secret-only";
});

const claims = { c: "guides" as const, id: "5", site: "2", uid: "3" };
const hour = SITE_PREVIEW_WINDOW_SECONDS * 1000;

describe("site preview tokens", () => {
  it("stay identical within a window so the live preview frame is not reloaded", () => {
    const start = Math.floor(Date.now() / hour) * hour;
    expect(signSitePreview(claims, start + 1_000)).toBe(signSitePreview(claims, start + hour - 1_000));
    expect(signSitePreview(claims, start + hour + 1_000)).not.toBe(signSitePreview(claims, start + 1_000));
  });

  it("are valid for at least one window and at most two", () => {
    const now = Date.now();
    const token = signSitePreview(claims, now);
    expect(verifyPreview(token, now)).toMatchObject(claims);
    expect(verifyPreview(token, now + hour - 1_000)).not.toBeNull();
    expect(verifyPreview(token, now + 2 * hour + 1_000)).toBeNull();
  });
});

describe("site preview URLs", () => {
  it("follow each site's preview page and language routing", () => {
    const token = "abc.def";
    expect(sitePreviewUrl({ slug: "gildra", publicUrl: "https://gildra.net" }, "en", token)).toBe("https://gildra.net/cms-preview?token=abc.def");
    expect(sitePreviewUrl({ slug: "gildra", publicUrl: "https://gildra.net" }, "ru", token)).toBe("https://gildra.net/ru/cms-preview?token=abc.def");
    expect(sitePreviewUrl({ slug: "riftden", publicUrl: "https://riftden.com" }, "ru", token)).toBe("https://riftden.com/preview?token=abc.def");
    expect(sitePreviewUrl({ slug: "riftden", publicUrl: "https://riftden.com" }, "en", token)).toBe("https://riftden.com/en/preview?token=abc.def");
    expect(sitePreviewUrl({ slug: "other", publicUrl: "https://x.example" }, "en", token)).toBeNull();
  });

  it("are enabled per site by CMS_SITE_PREVIEW", () => {
    expect([...nativePreviewSites({ CMS_SITE_PREVIEW: " riftden , gildra," })]).toEqual(["riftden", "gildra"]);
    expect(nativePreviewSites({}).size).toBe(0);
  });
});
