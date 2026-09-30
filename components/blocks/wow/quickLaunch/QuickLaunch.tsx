import Link from "next/link";
import { GAMES, gameHref } from "@/lib/games/registry";
import { t } from "@/lib/i18n";
import type { BlockComponentProps, EmptyProps } from "@/lib/blocks/types";

/** A visible task launcher for users who do not yet know the site's map. */
export function QuickLaunch({ lang, game }: BlockComponentProps<EmptyProps, undefined>) {
  const tt = t(lang);
  const gameDefinition = GAMES[game];

  return (
    <section className="quick-launch" aria-labelledby="quick-launch-title">
      <div className="quick-head">
        <div>
          <div className="cap">{tt("Start here")}</div>
          <h2 id="quick-launch-title">{tt("What do you need to do?")}</h2>
        </div>
        <p>{tt("Pick a task and Gildra will take you straight to the useful view.")}</p>
      </div>
      <div className="quick-grid">
        {gameDefinition.nav.tasks.map((task) => (
          <Link key={task.title} className="quick-action" href={gameHref(gameDefinition, lang, task.path)}>
            <span className="quick-icon" aria-hidden="true">
              <svg className="i"><use href={task.icon} /></svg>
            </span>
            <span className="quick-copy">
              <span className="quick-task">{tt(task.task)}</span>
              <strong>{tt(task.title)}</strong>
              <span className="quick-desc">{tt(task.desc)}</span>
            </span>
            <span className="quick-arrow" aria-hidden="true">↗</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
