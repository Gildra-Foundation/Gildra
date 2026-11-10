import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { homeMetadata } from "../../components/wow/home/homeMetadata.ts";
import { homeStructuredData } from "../../components/wow/home/homeStructuredData.ts";
import { wowHomeCopy } from "../../components/wow/home/wowHomeCopy.ts";

describe("WoW hub SEO parity", () => {
  for (const locale of ["en", "ru"] as const) it(`${locale}: concise metadata and connected schema`, () => {
    const meta = homeMetadata(locale);
    const copy = wowHomeCopy[locale];
    assert(copy.metaTitle.length <= 60);
    assert(copy.description.length >= 140 && copy.description.length <= 160, `${copy.description.length}`);
    assert.equal(meta.openGraph.siteName, "WowArcana");
    assert.equal(meta.alternates?.canonical, `${locale === "ru" ? "/ru" : ""}/wow`);
    assert.deepEqual(meta.robots, { index: true, follow: true });
    const data = homeStructuredData(locale);
    const site = data.find(thing => thing["@type"] === "WebSite")!;
    const page = data.find(thing => thing["@type"] === "CollectionPage")!;
    assert.equal((page.isPartOf as { "@id": string })["@id"], site["@id"]);
    assert.equal(page.inLanguage, locale);
    assert.equal((page.about as { name: string }).name, "World of Warcraft");
    assert(data.some(thing => thing["@type"] === "BreadcrumbList"));
    assert(data.some(thing => thing["@type"] === "ItemList"));
    assert.equal((site.potentialAction as { "@type": string })["@type"], "SearchAction");
  });
});
