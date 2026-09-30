import Link from "next/link";
import { ArrowRight, Radio, Swords } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { ContinueItem, PersonalMetaRow, PlatformGame } from "@/lib/platform/home/types";
import type { GameHubDefinition } from "@/lib/platform/games/config";
import { OptimizedResilientImage } from "@/components/media/OptimizedResilientImage";
import { GameTrackingToggle } from "./GameTrackingToggle";
import styles from "./gameHub.module.css";

type Props = {
  definition: GameHubDefinition;
  game: PlatformGame;
  meta?: PersonalMetaRow;
  active?: ContinueItem;
  lang: Lang;
};

export function GameHero({ definition, game, meta, active, lang }: Props) {
  const prefix = lang === "ru" ? "/ru" : "";
  const primaryHref = definition.id === "diablo" ? `${prefix}/patches` : `${prefix}/search?game=${definition.id}`;
  const secondaryHref = definition.id === "diablo"
    ? `${prefix}/profile/arcanist`
    : `${prefix}/compare?game=${definition.id}`;
  const focusImage = active?.imageUrl ?? meta?.focusIconUrl ?? definition.iconUrl;

  return (
    <section className={styles.hero} data-reveal>
      <div className={styles.heroWatermark} aria-hidden="true"><img src={definition.iconUrl} alt="" width="320" height="320" /></div>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}><Radio />{definition.copy.eyebrow}</span>
        <div className={styles.gameIdentity}><img src={definition.iconUrl} alt="" width="62" height="62" /><span><b>{definition.name}</b><small>{game.subtitle}</small></span></div>
        <h1>{definition.copy.tagline}</h1>
        <p>{definition.copy.description}</p>
        <div className={styles.heroActions}>
          <Link className={styles.primaryAction} href={primaryHref}>{definition.copy.explore}<ArrowRight /></Link>
          <Link className={styles.secondaryAction} href={secondaryHref}><Swords />{definition.copy.compare}</Link>
        </div>
      </div>

      <aside className={styles.commandCard} aria-label={definition.copy.personalSignal}>
        <header><span><i />{definition.copy.personalSignal}</span><GameTrackingToggle followedLabel={definition.copy.followed} followLabel={definition.copy.follow} /></header>
        <div className={styles.commandFocus}>
          <div className={styles.focusPortrait}><OptimizedResilientImage src={focusImage} alt="" width={94} height={110} sizes="(max-width: 760px) 66px, 78px" loading="lazy" fetchPriority="low" fallback={<img src={definition.iconUrl} alt="" width="94" height="110" />} /></div>
          <div><small>{meta?.mode ?? game.subtitle}</small><h2>{meta?.focus ?? definition.name}</h2><p>{meta?.focusDetail ?? game.subtitle}</p></div>
          <strong data-count>{meta?.score ?? "—"}</strong>
        </div>
        <div className={styles.commandStats}>
          <span><small>{definition.copy.rank}</small><b data-count>{meta?.rankValue ?? "—"}</b></span>
          <span><small>{definition.copy.movement}</small><b className={styles.positive} data-count>{meta?.change ?? "—"}</b></span>
          <span><small>{definition.copy.score}</small><b data-count>{meta?.score ?? "—"}</b></span>
        </div>
      </aside>
    </section>
  );
}
