"use client";

import Image from "next/image";
import { AlertTriangle, CheckCircle2, CircleHelp, Crosshair, ExternalLink, Footprints, Shield, Swords, Users } from "lucide-react";
import { getVoidspireMechanicGuide, type VoidspireMechanicTag } from "./voidspireMechanicGuide";
import type { RaidBoss } from "./midnightRaidData";
import styles from "./voidspireMechanicGuide.module.css";

const tagIcons: Partial<Record<VoidspireMechanicTag, typeof Footprints>> = {
  DODGE: Footprints,
  INTERRUPT: Crosshair,
  STOP: Crosshair,
  PURGE: Swords,
  DISPEL_MAGIC: Shield,
  SOAK: Users,
  TANK_SWAP: Shield,
  DEFENSIVE: Shield,
  TARGET_PRIORITY: Swords,
};

export function VoidspireMechanicGuide({ boss, locale }: { boss: RaidBoss; locale: "ru" | "en" }) {
  const guide = getVoidspireMechanicGuide(boss.slug);
  if (!guide) return null;
  const t = (text: { ru: string; en: string }) => text[locale];
  const verifiedSpellCount = guide.mechanics.filter((mechanic) => mechanic.spell).length;

  return (
    <section className={styles.guide} data-testid="voidspire-mechanic-guide" aria-labelledby="voidspire-actions-title">
      <header className={styles.header}>
        <div>
          <span>{locale === "ru" ? "Практическая тактика" : "Practical strategy"}</span>
          <h3 id="voidspire-actions-title">{locale === "ru" ? "Что делать с механиками" : "How to handle each mechanic"}</h3>
          <p>{locale === "ru"
            ? "Инструкции пересказаны по экспертному гайду. Spell ID и spell-иконка показаны только там, где идентичность отдельно подтверждена; нейтральный знак означает, что ID пока скрыт."
            : "Instructions are paraphrased from an expert guide. A spell ID and spell icon appear only where identity is separately verified; a neutral marker means the ID remains withheld."}</p>
        </div>
        <div className={styles.coverage} aria-label={locale === "ru" ? "Покрытие тактики" : "Strategy coverage"}>
          <strong>{guide.mechanics.length}</strong>
          <span>{locale === "ru" ? "разобрано" : "actions"}</span>
          <small>{verifiedSpellCount} {locale === "ru" ? "с проверенным ID" : "with verified IDs"}</small>
        </div>
      </header>

      <div className={styles.provenance}>
        <span><CheckCircle2 aria-hidden="true" />{locale === "ru" ? "Экспертный источник проверен" : "Expert source checked"}: {guide.checkedAt}</span>
        <span>{locale === "ru" ? "Обновление источника" : "Source updated"}: {guide.sourceUpdatedAt}</span>
        <a href={guide.sourceUrl} target="_blank" rel="noreferrer">Icy Veins <ExternalLink aria-hidden="true" /></a>
      </div>

      <ul className={styles.grid} data-testid="voidspire-action-list">
        {guide.mechanics.map((mechanic) => {
          const PrimaryIcon = tagIcons[mechanic.tags[0]] ?? CircleHelp;
          return (
            <li key={mechanic.id} className={styles.card} data-testid="voidspire-action-card">
              <header className={styles.cardHeader}>
                <span className={`${styles.abilityIcon} ${mechanic.spell ? styles.verifiedIcon : styles.pendingIcon}`}>
                  {mechanic.spell
                    ? <Image src={mechanic.spell.icon} alt="" width={48} height={48} />
                    : <PrimaryIcon aria-hidden="true" />}
                </span>
                <div>
                  <h4>{t(mechanic.name)}</h4>
                  <p>{mechanic.spell
                    ? `Spell #${mechanic.spell.id} · ${locale === "ru" ? "ID и иконка проверены" : "verified ID and icon"}`
                    : locale === "ru" ? "Spell ID скрыт до проверки" : "Spell ID withheld pending verification"}</p>
                </div>
              </header>

              <div className={styles.tags} aria-label={locale === "ru" ? "Типы механики" : "Mechanic tags"}>
                {mechanic.tags.map((tag) => {
                  const Icon = tagIcons[tag];
                  return <span key={tag}>{Icon ? <Icon aria-hidden="true" /> : null}{tag}</span>;
                })}
              </div>

              <dl className={styles.instructions}>
                <div><dt>{locale === "ru" ? "Кто" : "Who"}</dt><dd>{t(mechanic.who)}</dd></div>
                <div className={styles.primary}><dt>{locale === "ru" ? "Что делать" : "Do this"}</dt><dd>{t(mechanic.action)}</dd></div>
                <div><dt>{locale === "ru" ? "Где стоять" : "Position"}</dt><dd>{t(mechanic.position)}</dd></div>
                <div><dt>{locale === "ru" ? "Когда" : "When"}</dt><dd>{t(mechanic.timing)}</dd></div>
                <div className={styles.failure}><dt><AlertTriangle aria-hidden="true" />{locale === "ru" ? "Ошибка" : "If failed"}</dt><dd>{t(mechanic.failure)}</dd></div>
                <div><dt>{locale === "ru" ? "Сложности" : "Difficulty"}</dt><dd>{t(mechanic.difficulty)}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
