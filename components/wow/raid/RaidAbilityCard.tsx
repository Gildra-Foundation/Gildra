"use client";

import Image from "next/image";
import { BookOpen, ChevronDown, CircleHelp, Crosshair, Database, Shield, Sparkles, Swords } from "lucide-react";
import { IntelPopover } from "@/components/wow/mythic/IntelPopover";
import type { RaidAudience, RaidMechanic } from "./midnightRaidData";
import styles from "./raidAbilityCard.module.css";

const audienceMeta: Record<RaidAudience, { ru: string; en: string; color: string; icon: typeof Shield }> = {
  raid: { ru: "Весь рейд", en: "All players", color: "#d69543", icon: Sparkles },
  tank: { ru: "Танки", en: "Tanks", color: "#4e9ee9", icon: Shield },
  healer: { ru: "Лекари", en: "Healers", color: "#50bc72", icon: Crosshair },
  dps: { ru: "Бойцы", en: "Damage dealers", color: "#d85c4b", icon: Swords },
};

export function RaidAbilityCard({ mechanic, locale, bossName }: { mechanic: RaidMechanic; locale: "ru" | "en"; bossName: string }) {
  const meta = audienceMeta[mechanic.role];
  const AudienceIcon = meta.icon;
  const name = locale === "ru" ? mechanic.nameRu : mechanic.nameEn;
  const description = locale === "ru" ? mechanic.description : mechanic.descriptionEn;
  const descriptionSourceUrl = locale === "ru" ? mechanic.descriptionSourceUrlRu : mechanic.descriptionSourceUrlEn;
  const audience = locale === "ru" ? meta.ru : meta.en;

  return (
    <li className={styles.card} style={{ "--ability-tone": meta.color } as React.CSSProperties}>
      <IntelPopover
        tone={meta.color}
        kind="ability"
        content={(
          <div className={styles.tooltipContent}>
            <header className={styles.tooltipHeader}>
              <span><Database aria-hidden="true" /> Spell ID: {mechanic.spellId}</span>
              <b><AudienceIcon aria-hidden="true" /> {audience}</b>
            </header>
            <div className={styles.tooltipSubject}>
              <span className={styles.tooltipIcon}><Image src={mechanic.localIcon} alt="" width={54} height={54} /></span>
              <span><small>{bossName}</small><strong>{name}</strong><em>{mechanic.nameEn}</em></span>
            </div>
            <p className={styles.tooltipDescription}>{description}</p>
            <footer className={styles.tooltipSource}>
              <BookOpen aria-hidden="true" />
              <span><small>{locale === "ru" ? "Источник и provenance" : "Source and provenance"}</small><b><a href={descriptionSourceUrl} target="_blank" rel="noreferrer">{locale === "ru" ? "Точное описание DB2" : "Exact-build DB2 description"}</a></b></span>
              <em>{mechanic.descriptionBuild} · {mechanic.descriptionVerifiedAt.slice(0, 10)}</em>
            </footer>
          </div>
        )}
      >
        {(bindings) => (
          <button {...bindings} type="button" className={styles.trigger}>
            <span className={styles.iconFrame}><Image src={mechanic.localIcon} alt="" width={48} height={48} /></span>
            <span className={styles.copy}><strong>{name}</strong><small><AudienceIcon aria-hidden="true" /> {audience} · Spell #{mechanic.spellId}</small><em>{description}</em></span>
            <span className={styles.more}><CircleHelp aria-hidden="true" /><ChevronDown aria-hidden="true" /></span>
          </button>
        )}
      </IntelPopover>
    </li>
  );
}
