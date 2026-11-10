import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeFeatures, homeVersions } from "@/components/wow/home/homeFeatures";
import { navigationRealms, foreverRealms, linksFor } from "@/components/platform/navigation/navigationMap";
import { routeSections } from "@/lib/routes/registry";
for (const locale of ["en", "ru"] as const) {
  const features = homeFeatures(locale);
  const hrefs = features.map(feature => feature.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "Duplicate hub feature");
  for (const link of navigationRealms.flatMap(realm => linksFor(realm, locale))) assert(hrefs.includes(link.href), `Missing ${locale}: ${link.href}`);
  for (const link of features) {
    const section = Object.values(routeSections).find(section => section.path === link.href);
    assert(section, `Unregistered hub feature: ${link.href}`);
    assert(!('only' in section) || section.only === locale, `Wrong language: ${link.href}`);
  }
}
// Other versions have one hub entry each, as requested; its portal declares
// which public sections it covers. A new version section must stay reachable.
for (const realm of foreverRealms) for (const group of realm.groups) for (const link of group.links) {
  assert(homeVersions.some(portal => Object.values(portal.sections).includes(link.href) && portal.href === portal.path), `Missing version entry for ${link.href}`);
}
const manifest = JSON.parse(readFileSync('.next/server/app-paths-manifest.json', 'utf8'));
for (const locale of ['en', 'ru'] as const) for (const href of [...homeFeatures(locale).map(f => f.href), ...homeVersions.map(p => p.href).filter(href => !href.startsWith('#'))]) {
  const path = `${locale === 'ru' ? '/ru' : ''}${href}/page`;
  assert(Object.keys(manifest).some(key => key.replace('/(site)', '') === path), `Missing built page ${path}`);
}
console.log('EN/RU navigation coverage, uniqueness, registry and build destinations PASS');
