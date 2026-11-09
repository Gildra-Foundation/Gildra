import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SITE_ORIGIN } from "../../lib/seo/site.ts";
import { siteOrigin } from "../../lib/sitemap.ts";
import { absoluteUrl, websiteLd, breadcrumbListLd } from "../../lib/seo/structuredData.ts";
import { recordSitemapUrls } from "../../lib/library/recordSitemap.ts";

describe("canonical domain migration", () => {
  it("sitemaps and JSON-LD use the same canonical origin", () => {
    assert.equal(SITE_ORIGIN, "https://wowarcana.com");
    assert.equal(siteOrigin, SITE_ORIGIN);
    assert.equal(absoluteUrl("/ru/wow?region=eu#raids"), `${SITE_ORIGIN}/ru/wow?region=eu#raids`);
  });

  it("both language graphs have stable website and publisher identities on the new domain", () => {
    for (const locale of ["en", "ru"] as const) {
      const graph = websiteLd(locale, "World of Warcraft guides");
      assert.equal(graph[0]["@id"], `${SITE_ORIGIN}${locale === "ru" ? "/ru" : "/"}#website`);
      assert.equal(graph[1]["@id"], `${SITE_ORIGIN}/#organization`);
      assert.ok(!JSON.stringify(graph).includes("gildra.net"));
    }
  });

  it("breadcrumb links and localized record alternates migrate together", () => {
    const trail = breadcrumbListLd([{ label: "World of Warcraft", href: "/wow" }, { label: "Raids" }], "/wow/raids");
    assert.ok(JSON.stringify(trail).includes(`${SITE_ORIGIN}/wow/raids`));
    const urls = recordSitemapUrls([{ id: "00000000-0000-4000-8000-000000000001", type: "mount", slug: "gryphon", slugRu: "грифон" }], "ru").join("");
    assert.match(urls, /hreflang="en" href="https:\/\/wowarcana\.com\/library/);
    assert.match(urls, /hreflang="ru" href="https:\/\/wowarcana\.com\/ru\/library/);
    assert.ok(!urls.includes("gildra.net"));
  });
});
