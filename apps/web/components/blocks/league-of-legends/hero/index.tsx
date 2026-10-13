import { defineBlock, type BlockComponentProps, type RenderContext } from "@/lib/blocks/types";
import { getLeagueStatus, type LeagueStatus } from "@/lib/games/league-of-legends/api";
import styles from "@/components/league/league.module.css";
import { t } from "@/lib/i18n";

export type LeagueHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export type LeagueHeroData = { status: LeagueStatus | null };

/** Catalog hero: title copy + live patch card from the Data Dragon status endpoint. */
function LeagueHero({ eyebrow, title, description, data, lang }: BlockComponentProps<LeagueHeroProps, LeagueHeroData>) {
  const { status } = data;
  const tt = t(lang);
  return (
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>{tt(eyebrow)}</span>
        <h1>{tt(title)}</h1>
        <p>{tt(description)}</p>
      </div>
      <div className={styles.patch}>
        <span>{tt("LIVE DATA")}</span>
        <strong>{tt("Patch")} {status?.ddragonVersion ?? "—"}</strong>
        <small>{status?.ready ? "Riot Data Dragon · EN / RU" : tt("Catalog awaiting first import")}</small>
      </div>
    </section>
  );
}

export const leagueHeroBlock = defineBlock<LeagueHeroProps, LeagueHeroData>({
  type: "lol.hero",
  Component: LeagueHero,
  load: async (_ctx: RenderContext) => ({ status: await getLeagueStatus() }),
  demo: {
    props: {
      eyebrow: "GILDRA / GAME DATABASE",
      title: "Champion Database",
      description: "Explore every champion, ability, skin and official asset.",
    },
    data: { status: null },
    layout: "full",
  },
});
