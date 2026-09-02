import { defineBlock, type BlockComponentProps, type RenderContext } from "@/lib/blocks/types";
import { getLeagueStatus, type LeagueStatus } from "@/lib/games/league-of-legends/api";
import styles from "@/components/league/league.module.css";

export type LeagueHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export type LeagueHeroData = { status: LeagueStatus | null };

/** Catalog hero: title copy + live patch card from the Data Dragon status endpoint. */
function LeagueHero({ eyebrow, title, description, data }: BlockComponentProps<LeagueHeroProps, LeagueHeroData>) {
  const { status } = data;
  return (
    <section className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={styles.patch}>
        <span>LIVE DATA</span>
        <strong>Patch {status?.ddragonVersion ?? "—"}</strong>
        <small>{status?.ready ? "Riot Data Dragon · EN / RU" : "Catalog awaiting first import"}</small>
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
