import { ArrowRight } from "lucide-react";
import type { LeagueAbility } from "@/lib/games/league-of-legends/api";
import styles from "./league.module.css";

type SkillSlot = "Q" | "W" | "E" | "R";

export type SkillPathData = {
  priority: Array<Exclude<SkillSlot, "R">>;
  levels: Partial<Record<SkillSlot, number[]>>;
  winRate?: number;
  matches?: number;
  source?: string;
};

const demoPath: SkillPathData = {
  priority: ["Q", "E", "W"],
  levels: {
    Q: [1, 3, 5, 7, 9],
    W: [4, 14, 15, 17, 18],
    E: [2, 8, 10, 12, 13],
    R: [6, 11, 16],
  },
};

const spellOrder: SkillSlot[] = ["Q", "W", "E", "R"];

export function SkillPathPreview({
  abilities,
  locale,
  data,
}: {
  abilities: LeagueAbility[];
  locale: "en_US" | "ru_RU";
  data?: SkillPathData;
}) {
  const abilityBySlot = new Map(abilities.map((ability) => [ability.slot.toUpperCase(), ability]));
  const passive = abilities.find((ability) => ability.kind === "passive");
  const hasCompleteKit = spellOrder.every((slot) => abilityBySlot.has(slot));
  if (!hasCompleteKit || !passive) return null;

  const path = data ?? demoPath;
  const isDemo = !data;
  const copy = locale === "ru_RU" ? {
    eyebrow: "БУДУЩАЯ ИНТЕГРАЦИЯ",
    priority: "Приоритет умений",
    path: "Порядок прокачки",
    subtitle: "Популярная последовательность уровней",
    demo: "Демо-схема · не статистическая рекомендация",
    pending: "Источник статистики ожидается",
    apiReady: "API READY",
    gridLabel: "Демонстрационный порядок прокачки умений с 1 по 18 уровень",
  } : {
    eyebrow: "FUTURE INTEGRATION",
    priority: "Skill priority",
    path: "Skill path",
    subtitle: "Most popular ability leveling order",
    demo: "Demo layout · not a statistical recommendation",
    pending: "Statistics source pending",
    apiReady: "API READY",
    gridLabel: "Demonstration ability leveling order from level 1 through 18",
  };

  return <section className={styles.skillPathSection} id="skill-path" data-testid="skill-path">
    <header className={styles.skillPathIntro}>
      <div>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h2>{copy.path}</h2>
      </div>
      <span className={styles.skillApiBadge}>{copy.apiReady}</span>
    </header>

    <div className={styles.skillPathPanel}>
      <aside className={styles.skillPriorityPanel}>
        <h3>{copy.priority}</h3>
        <div className={styles.skillPriorityList} aria-label={copy.priority}>
          {path.priority.map((slot, index) => {
            const ability = abilityBySlot.get(slot)!;
            return <div className={styles.skillPriorityStep} key={slot}>
              <div className={styles.skillPriorityIcon}>
                {ability.iconUrl && <img src={ability.iconUrl} alt={ability.name} />}
                <b>{slot}</b>
              </div>
              {index < path.priority.length - 1 && <ArrowRight aria-hidden="true" size={27} strokeWidth={2} />}
            </div>;
          })}
        </div>
        <div className={styles.skillDataStatus}>
          <strong>{isDemo ? copy.demo : path.source ?? copy.apiReady}</strong>
          {typeof path.winRate === "number" && typeof path.matches === "number"
            ? <span>{path.winRate.toFixed(2)}% WR · {path.matches.toLocaleString(locale === "ru_RU" ? "ru-RU" : "en-US")} matches</span>
            : <span>{copy.pending}</span>}
        </div>
      </aside>

      <div className={styles.skillGridPanel}>
        <header>
          <h3>{copy.path}</h3>
          <p>{copy.subtitle}</p>
        </header>
        <div className={styles.skillGridScroll}>
          <div className={styles.skillGrid} role="grid" aria-label={copy.gridLabel}>
            {spellOrder.map((slot) => {
              const ability = abilityBySlot.get(slot)!;
              const selectedLevels = new Set(path.levels[slot] ?? []);
              return <div className={styles.skillGridRow} role="row" key={slot}>
                <div className={styles.skillAbilityLabel} role="rowheader">
                  {ability.iconUrl && <img src={ability.iconUrl} alt="" />}
                  <span>{ability.name}</span>
                  <b>{slot}</b>
                </div>
                {Array.from({ length: 18 }, (_, index) => index + 1).map((level) => {
                  const selected = selectedLevels.has(level);
                  return <span
                    className={selected ? styles.skillLevelSelected : styles.skillLevelCell}
                    role="gridcell"
                    aria-label={`${ability.name}: ${level}`}
                    aria-selected={selected}
                    key={level}
                  >{selected ? level : ""}</span>;
                })}
              </div>;
            })}
            <div className={`${styles.skillGridRow} ${styles.skillPassiveRow}`} role="row">
              <div className={styles.skillAbilityLabel} role="rowheader">
                {passive.iconUrl && <img src={passive.iconUrl} alt="" />}
                <span>{passive.name}</span>
                <b>P</b>
              </div>
              <div className={styles.skillPassiveTrack} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
