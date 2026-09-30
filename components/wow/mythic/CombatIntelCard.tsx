"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, ShieldAlert, Swords, UserRound } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { ResilientImage } from "@/components/media/ResilientImage";
import { IntelPopover } from "./IntelPopover";
import type { AbilityMediaPayload, EnemyMediaPayload } from "./dungeonCombatIntel.types";
import styles from "./combatIntelCard.module.css";

type EnemyPriority = "low" | "medium" | "high" | "boss";

const priorityTone: Record<EnemyPriority, string> = {
  low: "#b68a45",
  medium: "#dc8a39",
  high: "#ef5b39",
  boss: "#ff3f32",
};

export function EnemyIntelCard({
  dungeonName,
  name,
  count,
  priority,
  priorityLabel,
  encounter,
  summary,
  danger,
  media,
  icon,
}: {
  dungeonName?: string;
  name: string;
  count: number;
  priority: EnemyPriority;
  priorityLabel: string;
  encounter?: string;
  summary?: string;
  danger?: string;
  media?: EnemyMediaPayload;
  icon: ReactNode;
}) {
  const intel = summary && danger ? { summary, danger } : {
    summary: `${name} входит в выбранную группу маршрута. Приоритет и количество рассчитаны для стабильного прохождения ключа.`,
    danger: priority === "boss" ? "Ключевой противник шага: выполняйте отмеченные механики и не расходуйте назначения одновременно." : "Без контроля или правильного приоритета эта цель создаёт лишнее давление на танка и лекаря.",
  };
  const portraitVerified = media?.portraitVerified === true;
  const portraitUnavailable = media?.portraitStatus === "model_unavailable";
  const portraitUrl = portraitVerified ? media.portraitUrl : undefined;
  const portraitClass = portraitVerified ? styles.enemyPortrait : styles.spellIcon;
  const portraitStyle = {
    "--portrait-scale": media?.portraitScale ?? 1.35,
    "--portrait-y": media?.portraitY ?? "34%",
  } as CSSProperties;
  const tone = priorityTone[priority];

  return (
    <li
      className={`${styles.card} ${styles.enemyCard}`}
      data-intel-card="enemy"
      data-portrait-status={portraitVerified ? "verified" : portraitUnavailable ? "model-unavailable" : "unverified"}
      style={{ "--intel-tone": tone } as CSSProperties}
    >
      <IntelPopover
        tone={tone}
        kind="enemy"
        content={<>
          <header><span><ShieldAlert /> {media?.identityVerified && media.npcId ? `Существо · NPC #${media.npcId}` : "Существо · NPC ID не проверен"}</span><b>{priorityLabel}</b></header>
          <div className={styles.tooltipSubject}>
            <span className={`${styles.gameIcon} ${media ? styles.tooltipPortrait : styles.tooltipSpell}`} style={portraitStyle}>{portraitUrl ? <ResilientImage src={portraitUrl} alt="" loading="eager" fallback={icon} /> : icon}</span>
            <span><small>{dungeonName ?? "Mythic+"}{encounter ? ` · ${encounter}` : ""}</small><b>{name}</b></span>
          </div>
          <p>{intel.summary}</p>
          <div className={styles.warning}><AlertTriangle /><span><b>Чем опасен</b>{intel.danger}</span></div>
          <footer><span>Сколько в этой группе</span><strong>×{count}</strong></footer>
        </>}
      >
        {(bindings) => <button
          {...bindings}
          type="button"
          className={styles.trigger}
          data-intel-trigger
        >
          <span className={`${styles.gameIcon} ${portraitClass}`} style={portraitStyle}>
            {portraitUrl ? <ResilientImage src={portraitUrl} alt="" loading="lazy" fallback={icon} /> : icon}
          </span>
          <span className={styles.identity}><b>{name}</b><small>{priorityLabel} · {portraitVerified ? "Портрет проверен" : portraitUnavailable ? "Модель недоступна · placeholder" : "Портрет не проверен"}</small></span>
          <strong>×{count}</strong>
          <span className={styles.more}><CircleHelp /><span>Что делает</span><ChevronDown /></span>
        </button>}
      </IntelPopover>
    </li>
  );
}

export function AbilityIntelCard({
  name,
  action,
  responsible,
  source: sourceOverride,
  encounter,
  effect,
  failure,
  media: resolvedMedia,
  icon,
}: {
  name: string;
  action: string;
  responsible: string;
  source?: string;
  encounter?: string;
  effect?: string;
  failure?: string;
  media?: { media: AbilityMediaPayload; exact: boolean };
  icon: ReactNode;
}) {
  const intel = effect && failure ? { effect, failure } : {
    effect: `${name} — опасная способность выбранного противника. Интерфейс маршрута показывает требуемую реакцию и назначенного игрока.`,
    failure: action === "Прервать" ? "Заклинание сработает и создаст сильный урон или опасный эффект для всей группы." : action === "Снять эффект" || action === "Снять усиление" ? "Эффект продолжит усиливаться и заметно усложнит лечение группы." : "Невыполненная механика создаст лишний урон и может сорвать этот шаг маршрута.",
  };
  const source = sourceOverride ?? "Опасный противник";
  const media = resolvedMedia?.media;
  const tone = "#a335ee";

  return (
    <li
      className={`${styles.card} ${styles.abilityCard}`}
      data-intel-card="ability"
      style={{ "--intel-tone": tone } as CSSProperties}
    >
      <IntelPopover
        tone={tone}
        kind="ability"
        content={<>
          <header><span><ShieldAlert /> {resolvedMedia?.exact && media?.spellId ? `Заклинание · Spell #${media.spellId}` : "Заклинание · Путеводитель"}</span><b>{action}</b></header>
          <div className={styles.tooltipSubject}>
            <span className={`${styles.gameIcon} ${styles.tooltipSpell}`}>{media ? <ResilientImage src={media.iconUrl} alt="" loading="lazy" fallback={icon} /> : icon}</span>
            <span><small>{resolvedMedia?.exact ? media?.iconName : source}{encounter ? ` · ${encounter}` : ""}</small><b>{name}</b></span>
          </div>
          <p>{intel.effect}</p>
          <div className={styles.warning}><AlertTriangle /><span><b>Если не среагировать</b>{intel.failure}</span></div>
          <footer className={styles.response}>
            <span><Swords /><i><small>Кто применяет</small><b>{source}</b></i></span>
            <span><CheckCircle2 /><i><small>Что сделать</small><b>{action}</b></i></span>
            <span><UserRound /><i><small>Кто отвечает</small><b>{responsible}</b></i></span>
          </footer>
        </>}
      >
        {(bindings) => <button
          {...bindings}
          type="button"
          className={styles.trigger}
          data-intel-trigger
        >
          <span className={`${styles.gameIcon} ${styles.spellIcon}`}>
            {media ? <ResilientImage src={media.iconUrl} alt="" loading="lazy" fallback={icon} /> : icon}
          </span>
          <span className={styles.identity}><b>{name}</b><small>Применяет: {source}</small></span>
          <strong>{action}</strong>
          <span className={styles.more}><CircleHelp /><span>Ответ: {responsible}</span><ChevronDown /></span>
        </button>}
      </IntelPopover>
    </li>
  );
}
