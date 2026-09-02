import { defineBlock, type BlockComponentProps, type EmptyProps, type RenderContext } from "@/lib/blocks/types";
import { GAMES } from "@/lib/games/registry";
import { getLeagueChampions, type LeagueChampion } from "@/lib/games/league-of-legends/api";
import { ChampionCatalog } from "@/components/league/ChampionCatalog";
import styles from "@/components/league/league.module.css";
import { t } from "@/lib/i18n";

export type ChampionCatalogData = { champions: LeagueChampion[] };

/** Filterable champion grid, or the honest "awaiting first import" state. */
function ChampionCatalogBlock({ data, lang }: BlockComponentProps<EmptyProps, ChampionCatalogData>) {
  const tt = t(lang);
  if (data.champions.length === 0) {
    return (
      <div className={styles.unavailable}>
        <span>◇</span>
        <strong>{tt("Catalog is ready for its first import")}</strong>
        <p>{tt("Run the official Data Dragon importer to publish champions and assets atomically.")}</p>
        <code>lol-import --version latest --confirm</code>
      </div>
    );
  }
  return <ChampionCatalog champions={data.champions} lang={lang} />;
}

export const championCatalogBlock = defineBlock<EmptyProps, ChampionCatalogData>({
  type: "lol.championCatalog",
  Component: ChampionCatalogBlock,
  load: async (ctx: RenderContext) => ({
    champions: await getLeagueChampions(GAMES["league-of-legends"].apiLocale[ctx.lang]),
  }),
  demo: { props: {}, data: { champions: [] }, note: "Empty state — real champions come from the Go API." },
});
