import Link from "next/link";
import type { Metadata } from "next";
import { AtlasLegalFooter } from "@/components/atlas";
import { AtlasSection } from "@gildra/atlas-ui";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import { routeSections } from "@/lib/routes/registry";
import { mapPagePath, type AtlasMap, type Lang } from "@/lib/wow/worldMap/bundle";
import { worldMapBundle, worldMapChain, worldMapChildren, worldMapHome, worldMapVersion } from "@/lib/wow/worldMap/data.server";
import { levelSize, levelTiles, tileUrl } from "./engine/tiles";
import { WorldMapStage, type StageCrumb, type StagePoster } from "./WorldMapStage";
import { mapLine } from "./worldMapModel";
import { worldMapCopy } from "./worldMapCopy";
import styles from "./worldMap.module.css";

const prefix = (lang: Lang) => (lang === "ru" ? "/ru" : "");

export function worldMapMetadata(lang: Lang, map: AtlasMap | null): Metadata {
  const copy = worldMapCopy[lang];
  const bundle = worldMapBundle(lang);
  const home = worldMapHome(lang);
  const isHome = !map || map.id === home?.id;
  const path = isHome ? routeSections.worldMap.path : mapPagePath(map);
  const title = isHome ? copy.rootTitle : copy.pageTitle(map.name);
  const description = isHome ? copy.rootDescription : mapLine(lang, map, bundle) || copy.rootDescription;
  return {
    title,
    description,
    alternates: pairedAlternates(lang, path),
    openGraph: pageOpenGraph(lang, { title, description, path: `${prefix(lang)}${path}` }),
  };
}

/** Level of the first picture: about 1500 px wide, the same tiles the viewer starts with. */
function poster(map: AtlasMap): StagePoster | null {
  const art = map.art;
  if (!art) return null;
  let z = 0;
  while (z < art.maxZoom && levelSize(art, z)[0] < 1400) z += 1;
  const [lw, lh] = levelSize(art, z);
  const [cols, rows] = levelTiles(art, z);
  const tiles: StagePoster["tiles"] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const w = Math.min(art.tileSize, lw - x * art.tileSize), h = Math.min(art.tileSize, lh - y * art.tileSize);
      tiles.push({ src: tileUrl(art, map.id, z, x, y), left: (x * art.tileSize) / lw, top: (y * art.tileSize) / lh, width: w / lw, height: h / lh });
    }
  }
  return { aspect: art.width / art.height, tiles };
}

export function WorldMapPage({ lang, map: requested }: { lang: Lang; map?: AtlasMap | null }) {
  const copy = worldMapCopy[lang];
  const bundle = worldMapBundle(lang);
  const home = worldMapHome(lang);
  const map = requested ?? home;
  const p = prefix(lang);
  const chain = map ? worldMapChain(map, lang) : [];
  const crumbs: StageCrumb[] = [
    { label: "World of Warcraft", href: `${p}/wow` },
    ...chain.map((entry) => ({ label: entry.id === home?.id ? copy.title : entry.name, href: entry.id === home?.id ? `${p}${routeSections.worldMap.path}` : entry.page ? `${p}${mapPagePath(entry)}` : undefined, mapId: entry.id })),
  ];
  const children = map ? worldMapChildren(map, lang).filter((child) => child.page) : [];
  const heading = !map || map.id === home?.id ? copy.title : map.name;
  const line = map ? mapLine(lang, map, bundle) : "";
  const childTitle = map ? copy.children[map.type === "zone" && map.parent !== null && bundle.maps.find((m) => m.id === map.parent)?.type === "zone" ? "city" : map.type] : copy.places;

  return (
    <main className={styles.page} lang={lang}>
      <WorldMapStage
        lang={lang}
        mapId={map?.id ?? null}
        homeId={home?.id ?? null}
        title={heading}
        line={line}
        crumbs={crumbs}
        poster={map ? poster(map) : null}
        bundleUrl={`${routeSections.worldMap.path}/atlas/${lang}?v=${worldMapVersion()}`}
      />
      {children.length ? (
        <div className={styles.below}>
          <AtlasSection id="places" title={childTitle}>
            <ul className={styles.places}>
              {children.map((child) => (
                <li key={child.id}><Link href={`${p}${mapPagePath(child)}`} prefetch={false}>{child.name}</Link></li>
              ))}
            </ul>
          </AtlasSection>
        </div>
      ) : null}
      <AtlasLegalFooter lang={lang} />
    </main>
  );
}
