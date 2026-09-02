import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import styles from "@/components/league/league.module.css";

export type LeagueMainProps = {
  /** "catalog" = wide catalog column; "detail" = champion detail column. */
  variant?: "catalog" | "detail";
};

/** League content column (the game keeps its own width, wider than WoW's .section). */
function LeagueMain({ variant = "catalog", children }: BlockComponentProps<LeagueMainProps, undefined>) {
  return <div className={variant === "detail" ? styles.detailMain : styles.main}>{children}</div>;
}

export const leagueMainBlock = defineBlock<LeagueMainProps, undefined, true>({
  type: "lol.main",
  Component: LeagueMain,
  container: true,
  defaults: { variant: "catalog" },
  demo: { props: {}, data: undefined, note: "Layout wrapper — renders its children." },
});
