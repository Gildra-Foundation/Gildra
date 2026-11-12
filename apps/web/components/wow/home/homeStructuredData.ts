import { type JsonLdThing, absoluteUrl, websiteLd, itemListLd } from "@/lib/seo/structuredData";
import { homeFeatures, homeVersions } from "./homeFeatures";
import { wowHomeCopy } from "./wowHomeCopy";
import { liveSeason } from "@/lib/data/season";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { midnightClasses } from "@/lib/data/wow/specializations";

export function homeStructuredData(locale: "en" | "ru"): JsonLdThing[] {
  const t = wowHomeCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const url = absoluteUrl(prefix || "/");
  const website = absoluteUrl(`${prefix || "/"}#website`);
  const season = liveSeason();
  return [
    ...websiteLd(locale, t.description).map(thing => ({ ...thing, name: "WowArcana", ...(thing["@type"] === "WebSite" ? { publisher: { ...thing.publisher as object, name: "WowArcana" } } : {}) })),
    { "@context": "https://schema.org" as const, "@type": "CollectionPage", "@id": `${url}#page`, url, name: t.metaTitle, description: t.description, inLanguage: locale, isPartOf: { "@id": website }, about: { "@type": "VideoGame", name: "World of Warcraft" }, primaryImageOfPage: { "@type": "ImageObject", url: absoluteUrl("/assets/wow/home/hero/azeroth-wide-1200.avif"), width: 1200, height: 675 } },
    ...(season?.slug === "midnight-season-2" ? [itemListLd(t.moreDungeons, dungeonSlugs.map(slug => ({ name: locale === "ru" ? dungeonRoutes[slug].nameRu : dungeonRoutes[slug].name, href: `${prefix}/wow/mythic-plus/${season.slug}/${slug}` })), false)] : []),
    itemListLd(t.classesLabel, midnightClasses.map(entry => ({ name: locale === "ru" ? entry.nameRu : entry.nameEn, href: `${prefix}/wow/classes/${entry.slug}` })), false),
    itemListLd(t.productLabel, [...homeFeatures(locale), ...homeVersions.filter(portal => portal.id !== "retail")].map(link => ({ name: link.label[locale], href: `${prefix}${link.href}` })), false),
  ];
}
