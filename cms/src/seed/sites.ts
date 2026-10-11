import type { Payload, PayloadRequest } from "payload";

import { SKIP_REVALIDATION } from "../editorial/policy";

/**
 * The two network sites. Existing values are never overwritten: the seed only
 * creates what is missing, so it is safe to run repeatedly. It does not touch
 * staff or reader accounts.
 */
export const INITIAL_SITES = [
  {
    slug: "gildra",
    name: "Gildra",
    domain: "gildra.net",
    game: "wow" as const,
    publicUrl: "https://gildra.net",
    plausibleSiteId: "gildra.net",
    languages: ["en", "ru"] as ("en" | "ru")[],
    defaultLocale: "en" as const,
    siteTitle: { en: "Gildra", ru: "Gildra" },
  },
  {
    slug: "riftden",
    name: "Riftden",
    domain: "riftden.com",
    game: "lol" as const,
    publicUrl: "https://riftden.com",
    plausibleSiteId: "riftden.com",
    languages: ["en", "ru"] as ("en" | "ru")[],
    defaultLocale: "en" as const,
    siteTitle: { en: "Riftden", ru: "Riftden" },
  },
];

export type SeedReport = { createdSites: string[]; createdSettings: string[] };

export async function seedSites(payload: Payload, req?: Partial<PayloadRequest>): Promise<SeedReport> {
  const report: SeedReport = { createdSites: [], createdSettings: [] };
  for (const definition of INITIAL_SITES) {
    const { siteTitle, ...siteData } = definition;
    const found = await payload.find({
      collection: "sites",
      where: { slug: { equals: definition.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    let site = found.docs[0];
    if (!site) {
      site = await payload.create({ collection: "sites", data: siteData, overrideAccess: true, req });
      report.createdSites.push(definition.slug);
    }

    const settings = await payload.count({ collection: "site-settings", where: { site: { equals: site.id } }, overrideAccess: true, req });
    if (settings.totalDocs === 0) {
      const created = await payload.create({
        collection: "site-settings",
        data: { site: site.id, siteTitle: siteTitle.en },
        locale: "en",
        overrideAccess: true,
        context: { [SKIP_REVALIDATION]: true },
        req,
      });
      await payload.update({
        collection: "site-settings",
        id: created.id,
        data: { siteTitle: siteTitle.ru },
        locale: "ru",
        overrideAccess: true,
        context: { [SKIP_REVALIDATION]: true },
        req,
      });
      report.createdSettings.push(definition.slug);
    }
  }
  return report;
}
