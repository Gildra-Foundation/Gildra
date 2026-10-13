import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { platformHref } from "@/lib/platform/home/links";
import { GameMark, Panel, PanelTitle, TextLink } from "./primitives";
import styles from "./platformHome.module.css";

export function PatchPulse({ data, lang }: { data: PlatformHomeData; lang: Lang }) {
  const games = new Map(data.games.map((game) => [game.id, game]));
  return (
    <Panel className={styles.patchPulse}>
      <div className={styles.panelHeading}><PanelTitle info>{data.labels.patchPulse}</PanelTitle><TextLink href={platformHref("/patches", lang)}>{data.labels.viewAll}</TextLink></div>
      <div className={styles.patchList}>
        {data.patchPulse.map((group) => {
          const game = games.get(group.gameId)!;
          return (
            <article className={styles.patchGroup} key={group.gameId} data-reveal-item>
              <GameMark game={game} small />
              <div>
                <h3 style={{ color: game.accent }}>{group.gameName}</h3>
                <ul>
                  {group.changes.map((change, index) => (
                    <li key={index}><span>{change.text}</span><em className={styles[change.kind]}>{change.kind}</em></li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
