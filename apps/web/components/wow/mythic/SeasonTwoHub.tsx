import { ArrowDown, ArrowUpRight } from "lucide-react";
import { AtlasFrame, AtlasGrid, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton, type MaterialKit } from "@/components/wow/shared/materialAtlas";
import { PaintedCard } from "./PaintedCard";
import cardStyles from "./dungeonCardGrid.module.css";
import { contentManifest } from "@/lib/data/wow";
import { trail } from "@/lib/routes/registry";
import { wowSourceName, wowSourceNameLang } from "@/lib/wow/sourceLocale";
import { seasonTwoHubCopy } from "./seasonTwoHubCopy";
import styles from "./seasonTwoHub.module.css";

type Locale = "ru" | "en";

const OFFICIAL_SEASON_SOURCE = "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live";
/** The season's own kit is not painted yet: every tile wears Voidscar Arena (the season's void and amethyst). */
const kit: MaterialKit = "voidscar-arena";

/** Season 2 overview: one painted tile per activity, each a picture from that activity's own hub. */
export function SeasonTwoHub({ locale }: { locale: Locale }) {
  const copy = seasonTwoHubCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidSource = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss")?.names.en ?? "Venomous Abyss";
  const raidName = wowSourceName(raidSource, locale);
  const tiles = [
    { id: "raid", title: raidName, ...copy.tiles.raid, href: `${prefix}/wow/raids/venomous-abyss`, scene: "/assets/wow/raids/hub/venomous-abyss.webp" },
    { id: "mythic-plus", ...copy.tiles.mythicPlus, href: `${prefix}/wow/mythic-plus`, scene: "/assets/wow/mythic/hub/gateway.webp" },
    { id: "delves", ...copy.tiles.delves, href: `${prefix}/wow/delves`, scene: "/assets/wow/loading/dungeon.webp" },
    { id: "prey", ...copy.tiles.prey, href: OFFICIAL_SEASON_SOURCE, external: true, scene: "/assets/wow/loading/pvp.webp" },
    { id: "lairs", ...copy.tiles.lairs, href: `${prefix}/wow/lairs`, scene: "/assets/wow/lairs/bosses/nymrissa.jpg" },
  ];
  return (
    <AtlasFrame lang={locale} art="/assets/wow/loading/raid-wow-optimized.webp" artPosition="center 40%" tint="rgba(122, 64, 196, .2)">
      <AtlasHero
        breadcrumbs={trail(locale, "season2")}
        breadcrumbsLabel={copy.breadcrumbs}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        actions={<MaterialLinkButton kit={kit} fit="stack" href="#activities" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.choose}</MaterialLinkButton>}
      />
      <AtlasSection id="activities" title={copy.listTitle}>
        <AtlasGrid min={290} fit className={cardStyles.hubGrid}>
          {tiles.map((tile) => (
            <div key={tile.id} id={tile.id} className={styles.tile}>
              <PaintedCard kit={kit} id={`season-two-${tile.id}`} href={tile.href} external={"external" in tile} scene={tile.scene} location={tile.label} title={tile.title} titleLang={tile.id === "raid" ? wowSourceNameLang(raidSource, locale) : tile.id === "prey" && locale === "ru" ? "en" : undefined} description={tile.text} action={tile.action} />
            </div>
          ))}
        </AtlasGrid>
      </AtlasSection>
      <p className={styles.source}><a href={OFFICIAL_SEASON_SOURCE} target="_blank" rel="noreferrer">{copy.source}<ArrowUpRight aria-hidden="true" /></a></p>
    </AtlasFrame>
  );
}
