import { describe, expect, it } from "vitest";

import { articleUrl } from "../../src/admin/sitePaths";
import { SLUG_MAX_LENGTH, slugify } from "../../src/utilities/slugify";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe("slugify", () => {
  it("transliterates Russian titles", () => {
    expect(slugify("Гайд по Мифик+ для новичков: с чего начать")).toBe("gaid-po-mifik-dlya-novichkov-s-chego-nachat");
    expect(slugify("Щит, ёлка и Объём")).toBe("shchit-elka-i-obem");
  });

  it("keeps English titles readable", () => {
    expect(slugify("Comparing champion stats across levels")).toBe("comparing-champion-stats-across-levels");
    expect(slugify("  Patch 11.2.5 — Tier List!  ")).toBe("patch-11-2-5-tier-list");
    expect(slugify("Café déjà vu")).toBe("cafe-deja-vu");
  });

  it("always produces a slug the CMS accepts", () => {
    for (const title of ["Ахри в мид", "???", "a".repeat(200), "Слово ".repeat(40)]) {
      const slug = slugify(title);
      expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
      if (slug) expect(slug).toMatch(VALID_SLUG);
    }
    expect(slugify("???")).toBe("");
  });
});

describe("articleUrl", () => {
  it("follows each site's routing", () => {
    const gildra = { slug: "gildra", publicUrl: "https://gildra.net" };
    const riftden = { slug: "riftden", publicUrl: "https://riftden.com" };
    expect(articleUrl(gildra, "mplus", "en")).toBe("https://gildra.net/wow/articles/mplus");
    expect(articleUrl(gildra, "mplus", "ru")).toBe("https://gildra.net/ru/wow/articles/mplus");
    expect(articleUrl(riftden, "stat-growth", "ru")).toBe("https://riftden.com/articles/stat-growth");
    expect(articleUrl(riftden, "stat-growth", "en")).toBe("https://riftden.com/en/articles/stat-growth");
  });

  it("gives no link for unknown sites or empty slugs", () => {
    expect(articleUrl({ slug: "other", publicUrl: "https://x.example" }, "a", "en")).toBeNull();
    expect(articleUrl({ slug: "gildra", publicUrl: "https://gildra.net" }, "", "en")).toBeNull();
  });
});
