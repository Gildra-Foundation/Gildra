"use client";

import { wowNpcName, wowSpellName } from "@/lib/wow/sourceLocale";
import { wowRouteText } from "@/lib/wow/routeSourceLocale";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, ShieldAlert, Swords, UserRound } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { ResilientImage } from "@/components/media/ResilientImage";
import { IntelPopover } from "./IntelPopover";
import type { AbilityMediaPayload, EnemyMediaPayload } from "./dungeonCombatIntel.types";
import { mythicRouteCopy, type RouteLocale } from "./mythicRouteCopy";
import styles from "./combatIntelCard.module.css";

type EnemyPriority = "low" | "medium" | "high" | "boss";

/** Priority is data, so it keeps a status colour; everything else stays amber. */
const priorityTone: Record<EnemyPriority, string> = {
  low: "var(--atlas-text-subtle)",
  medium: "var(--atlas-caution)",
  high: "var(--atlas-negative)",
  boss: "var(--atlas-negative)",
};
const abilityTone = "var(--atlas-accent)";

export function EnemyIntelCard({
  locale,
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
  locale: RouteLocale;
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
  const copy = mythicRouteCopy[locale];
  const intel = summary && danger ? { summary, danger } : {
    summary: copy.enemyFallback(name),
    danger: priority === "boss" ? copy.enemyDangerBoss : copy.enemyDanger,
  };
  const portraitVerified = media?.portraitVerified === true;
  const portraitUnavailable = media?.portraitStatus === "model_unavailable";
  const portraitUrl = portraitVerified ? media.portraitUrl : undefined;
  const portraitClass = portraitVerified ? ` ${styles.enemyPortrait}` : "";
  const portraitStyle = {
    "--portrait-scale": media?.portraitScale ?? 1.35,
    "--portrait-y": media?.portraitY ?? "34%",
  } as CSSProperties;
  const tone = priorityTone[priority];

  return (
    <li
      className={styles.card}
      data-intel-card="enemy"
      data-portrait-status={portraitVerified ? "verified" : portraitUnavailable ? "model-unavailable" : "unverified"}
      style={{ "--intel-tone": tone } as CSSProperties}
    >
      <IntelPopover
        tone={tone}
        kind="enemy"
        content={<div className={styles.intelBody}>
          <header><span><ShieldAlert aria-hidden="true" /> {copy.creature()}</span><b>{priorityLabel}</b></header>
          <div className={styles.tooltipSubject}>
            <span className={media ? `${styles.gameIcon} ${styles.tooltipPortrait}` : styles.gameIcon} style={portraitStyle}>{portraitUrl ? <ResilientImage src={portraitUrl} alt="" loading="eager" fallback={icon} /> : icon}</span>
            <span><small>{dungeonName ?? "Mythic+"}{encounter ? ` · ${encounter ? wowRouteText(encounter, locale) : encounter}` : ""}</small><b>{wowNpcName(name, locale, media?.identityVerified ? media.npcId : undefined)}</b></span>
          </div>
          <p>{wowRouteText(intel.summary, locale)}</p>
          <div className={styles.warning}><AlertTriangle aria-hidden="true" /><span><b>{copy.whyDangerous}</b>{wowRouteText(intel.danger, locale)}</span></div>
          <footer><span>{copy.countInGroup}</span><strong>×{count}</strong></footer>
        </div>}
      >
        {(bindings) => <button
          {...bindings}
          type="button"
          className={styles.trigger}
          data-intel-trigger
        >
          <span className={`${styles.gameIcon}${portraitClass}`} style={portraitStyle}>
            {portraitUrl ? <ResilientImage src={portraitUrl} alt="" loading="lazy" fallback={icon} /> : icon}
          </span>
          <span className={styles.identity}><b>{wowNpcName(name, locale, media?.identityVerified ? media.npcId : undefined)}</b><small>{priorityLabel}</small></span>
          <strong>×{count}</strong>
          <span className={styles.more}><CircleHelp aria-hidden="true" /><span>{copy.whatItDoes}</span><ChevronDown aria-hidden="true" /></span>
        </button>}
      </IntelPopover>
    </li>
  );
}

export function AbilityIntelCard({
  locale,
  name,
  action,
  interrupt = false,
  dispel = false,
  responsible,
  source: sourceOverride,
  encounter,
  effect,
  failure,
  media: resolvedMedia,
  icon,
}: {
  locale: RouteLocale;
  name: string;
  action: string;
  interrupt?: boolean;
  dispel?: boolean;
  responsible: string;
  source?: string;
  encounter?: string;
  effect?: string;
  failure?: string;
  media?: { media: AbilityMediaPayload; exact: boolean };
  icon: ReactNode;
}) {
  const copy = mythicRouteCopy[locale];
  const intel = effect && failure ? { effect, failure } : {
    effect: copy.abilityFallback(name),
    failure: interrupt ? copy.abilityFailInterrupt : dispel ? copy.abilityFailDispel : copy.abilityFailOther,
  };
  const source = sourceOverride ?? copy.dangerousEnemy;
  const media = resolvedMedia?.media;

  return (
    <li
      className={styles.card}
      data-intel-card="ability"
      style={{ "--intel-tone": abilityTone } as CSSProperties}
    >
      <IntelPopover
        tone={abilityTone}
        kind="ability"
        content={<div className={styles.intelBody}>
          <header><span><ShieldAlert aria-hidden="true" /> {copy.spell(resolvedMedia?.exact ? media?.spellId : undefined)}</span><b>{action}</b></header>
          <div className={styles.tooltipSubject}>
            <span className={styles.gameIcon}>{media ? <ResilientImage src={media.iconUrl} alt="" loading="lazy" fallback={icon} /> : icon}</span>
            <span><small>{wowRouteText(source, locale)}{encounter ? ` · ${encounter ? wowRouteText(encounter, locale) : encounter}` : ""}</small><b>{wowSpellName(name, locale, resolvedMedia?.exact ? media?.spellId : undefined)}</b></span>
          </div>
          <p>{wowRouteText(intel.effect, locale)}</p>
          <div className={styles.warning}><AlertTriangle aria-hidden="true" /><span><b>{copy.ifIgnored}</b>{wowRouteText(intel.failure, locale)}</span></div>
          <footer className={styles.response}>
            <span><Swords aria-hidden="true" /><i><small>{copy.castBy}</small><b>{source ? wowRouteText(source, locale) : source}</b></i></span>
            <span><CheckCircle2 aria-hidden="true" /><i><small>{copy.whatToDo}</small><b>{action}</b></i></span>
            <span><UserRound aria-hidden="true" /><i><small>{copy.responsible}</small><b>{responsible}</b></i></span>
          </footer>
        </div>}
      >
        {(bindings) => <button
          {...bindings}
          type="button"
          className={styles.trigger}
          data-intel-trigger
        >
          <span className={styles.gameIcon}>
            {media ? <ResilientImage src={media.iconUrl} alt="" loading="lazy" fallback={icon} /> : icon}
          </span>
          <span className={styles.identity}><b>{wowSpellName(name, locale, resolvedMedia?.exact ? media?.spellId : undefined)}</b><small>{copy.castByShort(wowRouteText(source, locale))}</small></span>
          <strong>{action}</strong>
          <span className={styles.more}><CircleHelp aria-hidden="true" /><span>{copy.responseShort(responsible)}</span><ChevronDown aria-hidden="true" /></span>
        </button>}
      </IntelPopover>
    </li>
  );
}
