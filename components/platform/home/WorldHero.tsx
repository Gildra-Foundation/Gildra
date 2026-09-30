import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import { gameHubHref } from "@/lib/platform/games/config";
import { GameMark } from "./primitives";
import styles from "./platformHome.module.css";

export function WorldHero({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroIntro}>
        <span className={styles.compass} aria-hidden="true"><i>✦</i></span>
        <div>
          <p>{data.greeting}</p>
          <h1>{data.title}</h1>
        </div>
      </div>
      <div className={styles.gameStrip} aria-label="Your games" data-reveal>
        {data.games.map((game) => (
          <Link className={styles.gameCard} href={gameHubHref(game.id, lang)} key={game.id} data-reveal-item>
            <GameMark game={game} />
            <span>
              <strong>{game.name}</strong>
              <small style={{ color: game.accent }}>{game.subtitle}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
