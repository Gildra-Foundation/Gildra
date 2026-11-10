import { type JsonLdThing, absoluteUrl, websiteLd, breadcrumbListLd, itemListLd } from "@/lib/seo/structuredData";
import { wowHomeCopy } from "./wowHomeCopy";

export function homeStructuredData(locale: "en" | "ru"): JsonLdThing[] {
  const t = wowHomeCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const url = absoluteUrl(`${prefix}/wow`);
  const website = absoluteUrl(`${prefix || "/"}#website`);
  return [
    ...websiteLd(locale, t.description).map(thing => ({ ...thing, name: "WowArcana", ...(thing["@type"] === "WebSite" ? { publisher: { ...thing.publisher as object, name: "WowArcana" } } : {}) })),
    { "@context": "https://schema.org" as const, "@type": "CollectionPage", "@id": `${url}#page`, url, name: t.metaTitle, description: t.description, inLanguage: locale, isPartOf: { "@id": website }, about: { "@type": "VideoGame", name: "World of Warcraft" }, primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl("/assets/wow/home/hero/azeroth-wide-1200.avif"), width: 1200, height: 675 } },
    breadcrumbListLd([{ label: "WowArcana", href: prefix || "/" }, { label: "World of Warcraft", href: `${prefix}/wow` }]),
    itemListLd(t.productLabel, [
      { name: "Mythic+", href: `${prefix}/wow/mythic-plus` }, { name: t.raids, href: `${prefix}/wow/raids` },
      { name: t.featured.map.title, href: `${prefix}/wow/map` }, { name: t.featured.classes.title, href: `${prefix}/wow/classes` },
      { name: t.toolsCopy.auction, href: `${prefix}/wow/auction` }, { name: t.toolsCopy.tierLists, href: `${prefix}/tier-lists` }, { name: t.toolsCopy.library, href: `${prefix}/library` },
    ], false),
  ];
}
