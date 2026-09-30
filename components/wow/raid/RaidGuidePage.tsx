"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Castle, ChevronRight, Crosshair, Database, MapPin, Shield, Sparkles, Swords, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { RaidAbilityCard } from "./RaidAbilityCard";
import { RaidTacticalBoard } from "./RaidTacticalBoard";
import { VoidspireMechanicGuide } from "./VoidspireMechanicGuide";
import { midnightRaids, raidSlugs, type RaidAudience, type RaidDefinition } from "./midnightRaidData";
import { getVoidspireMechanicCount } from "./voidspireMechanicGuide";
import styles from "./raidGuidePage.module.css";

const roleFilters: Array<{ id: "all" | RaidAudience; ru: string; en: string; icon: typeof Shield }> = [
  { id: "all", ru: "Все механики", en: "All mechanics", icon: BookOpen },
  { id: "raid", ru: "Весь рейд", en: "All players", icon: Sparkles },
  { id: "tank", ru: "Танки", en: "Tanks", icon: Shield },
  { id: "healer", ru: "Лекари", en: "Healers", icon: Crosshair },
  { id: "dps", ru: "Бойцы", en: "Damage", icon: Swords },
];

export function RaidGuidePage({ raid, locale, initialBossSlug }: { raid: RaidDefinition; locale: "ru" | "en"; initialBossSlug?: string }) {
  const initialBossIndex = initialBossSlug ? raid.bosses.findIndex((boss) => boss.slug === initialBossSlug) : 0;
  const [selectedBoss, setSelectedBoss] = useState(Math.max(0, initialBossIndex));
  const [role, setRole] = useState<"all" | RaidAudience>("all");
  const boss = raid.bosses[selectedBoss];
  const mechanics = role === "all" ? boss.mechanics : boss.mechanics.filter((mechanic) => mechanic.role === role);
  const prefix = locale === "ru" ? "/ru" : "";
  const t = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;

  useEffect(() => {
    if (!initialBossSlug) return;
    const index = raid.bosses.findIndex((item) => item.slug === initialBossSlug);
    if (index >= 0) {
      setSelectedBoss(index);
      setRole("all");
    }
  }, [initialBossSlug, raid]);

  return (
    <main className={styles.page} style={{ "--raid-accent": raid.accent, "--raid-art": `url(${raid.artwork})` } as React.CSSProperties}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.commandBar}>
          <Link href={`${prefix}/wow/raids`} className={styles.journalLink}><BookOpen aria-hidden="true" /><span>{t("Рейдовый журнал", "Raid journal")}</span></Link>
          <span className={styles.crumb}><ChevronRight aria-hidden="true" />{t(raid.nameRu, raid.nameEn)}</span>
          <div className={styles.season}><i /> Midnight · Season 1</div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><Castle aria-hidden="true" />{t("Рейд Midnight", "Midnight raid")} · {raid.bosses.length} {t(raid.bosses.length === 1 ? "босс" : "боссов", raid.bosses.length === 1 ? "boss" : "bosses")}</div>
            <h1>{t(raid.nameRu, raid.nameEn)}</h1>
            <div className={styles.location}><MapPin aria-hidden="true" />{t(raid.locationRu, raid.locationEn)}<span />Journal #{raid.instanceId}</div>
            <p>{t(raid.descriptionRu, raid.descriptionEn)}</p>
            <div className={styles.difficulties} aria-label={t("Сложности рейда", "Raid difficulties")}>
              {[t("Поиск рейда", "Raid Finder"), t("Обычная", "Normal"), t("Героическая", "Heroic"), t("Эпохальная", "Mythic")].map((difficulty) => <span key={difficulty}>{difficulty}</span>)}
            </div>
          </div>
          <div className={styles.raidSigil} aria-hidden="true"><span><Castle /></span><b>{String(raid.bosses.length).padStart(2, "0")}</b><small>{t("БОССОВ", "BOSSES")}</small></div>
        </section>

        <nav className={styles.raidTabs} aria-label={t("Рейды Midnight", "Midnight raids")}>
          {raidSlugs.map((slug) => {
            const item = midnightRaids[slug];
            return <Link prefetch={false} key={slug} href={`${prefix}/wow/raids/${slug}`} aria-current={slug === raid.slug ? "page" : undefined} style={{ "--tab-accent": item.accent } as React.CSSProperties}><span><Image src={item.artwork} alt="" fill sizes="(max-width: 700px) 90vw, 260px" /></span><b>{t(item.nameRu, item.nameEn)}</b><small>{item.bosses.length} {t("боссов", "bosses")}</small><ChevronRight aria-hidden="true" /></Link>;
          })}
        </nav>

        <div className={styles.workspace}>
          <aside className={styles.bossRail}>
            <header><span>{t("Список встреч", "Encounter list")}</span><b>{selectedBoss + 1} / {raid.bosses.length}</b></header>
            <div className={styles.bossList} role="list">
              {raid.bosses.map((item, index) => (
                <Link prefetch={false} key={item.slug} href={`${prefix}/wow/raids/${raid.slug}/${item.slug}`} className={index === selectedBoss ? styles.activeBoss : undefined} aria-current={index === selectedBoss ? "page" : undefined}>
                  <span className={styles.order}>{String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.portrait}><Image src={item.artwork} alt="" fill sizes="64px" /></span>
                  <span className={styles.bossName}><b>{t(item.nameRu, item.nameEn)}</b><small>{raid.slug === "the-voidspire" ? `${getVoidspireMechanicCount(item.slug)} ${t("действий", "guide actions")}` : `${item.mechanics.length} ${t("механик", "mechanics")}`}</small></span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              ))}
            </div>
            <footer><Database aria-hidden="true" /><span><small>{t("Данные журнала", "Journal data")}</small><b>Midnight · Patch 12.0</b></span></footer>
          </aside>

          <section className={styles.encounter} data-testid="raid-encounter">
            <div className={styles.bossFeature}>
              <Image key={boss.artwork} src={boss.artwork} alt={t(boss.nameRu, boss.nameEn)} fill priority sizes="(max-width: 900px) 100vw, 68vw" />
              <div className={styles.bossShade} />
              <div className={styles.bossIdentity}>
                <span>{t("Встреча", "Encounter")} {String(selectedBoss + 1).padStart(2, "0")}</span>
                <h2 data-testid="boss-title">{t(boss.nameRu, boss.nameEn)}</h2>
                <p>{t(boss.descriptionRu, boss.descriptionEn)}</p>
                <small><Database aria-hidden="true" /> Encounter #{boss.encounterId} · {t("Журнал приключений", "Adventure Guide")}</small>
              </div>
            </div>

            {raid.slug === "the-voidspire" ? (
              <>
                <RaidTacticalBoard boss={boss} locale={locale} />
                <VoidspireMechanicGuide boss={boss} locale={locale} />
              </>
            ) : (
              <section className={styles.mechanicsPanel} aria-labelledby="strategy-status">
                <header className={styles.mechanicsHeader}>
                  <div><span>{t("Статус тактики", "Strategy status")}</span><h3 id="strategy-status">{t("Маршрут и тактическая доска скрыты", "Route and tactical board withheld")}</h3><p>{t("Pull-порядок, позиции, тайминги и различия сложностей вернутся после отдельной проверки источников и привязки механик к spell/NPC ID.", "Pull order, positions, timings, and difficulty differences will return after separate source verification and spell/NPC ID linkage.")}</p></div>
                </header>
              </section>
            )}

            <div className={styles.mechanicsPanel}>
              <header className={styles.mechanicsHeader}>
                <div><span>{t("Проверенный поднабор", "Verified subset")}</span><h3>{t("Механики встречи", "Encounter mechanics")}</h3><p>{t("Показываются только способности с доказанными EN/RU-описаниями и контекстом сложности. Проверенные ID и иконка без такого источника недостаточны для публикации текста.", "Only abilities with proven EN/RU descriptions and difficulty context are shown. A verified ID and icon alone are insufficient to publish ability text.")}</p></div>
                <strong>{boss.abilityCoverage?.publicationSafeAbilities ?? boss.mechanics.length}<small>{t("показано", "shown")} · {boss.abilityCoverage?.withheldAbilities ?? 0} {t("скрыто", "withheld")}</small></strong>
              </header>
              <div className={styles.filters} aria-label={t("Фильтр по роли", "Role filter")}>
                {roleFilters.map((filter) => {
                  const Icon = filter.icon;
                  const count = filter.id === "all" ? boss.mechanics.length : boss.mechanics.filter((mechanic) => mechanic.role === filter.id).length;
                  return <button key={filter.id} type="button" aria-pressed={role === filter.id} onClick={() => setRole(filter.id)} disabled={count === 0}><Icon aria-hidden="true" /><span>{locale === "ru" ? filter.ru : filter.en}</span><b>{count}</b></button>;
                })}
              </div>
              {mechanics.length ? (
                <ul className={styles.mechanicsGrid} data-testid="mechanic-list">
                  {mechanics.map((mechanic) => <RaidAbilityCard key={mechanic.spellId} mechanic={mechanic} locale={locale} bossName={t(boss.nameRu, boss.nameEn)} />)}
                </ul>
              ) : <div className={styles.empty}>{boss.mechanics.length === 0
                ? t("Описания способностей скрыты до проверки источника и вариантов сложности.", "Ability descriptions are withheld until source and difficulty variants are verified.")
                : t("Для этой роли отдельные механики не отмечены.", "No role-specific mechanics are marked for this role.")}</div>}
              {mechanics.length > 0 && (boss.abilityCoverage?.withheldAbilities ?? 0) > 0 ? (
                <div className={styles.empty}>{t(
                  `Еще ${boss.abilityCoverage?.withheldAbilities} описаний скрыто до проверки source tokens и вариантов сложности.`,
                  `${boss.abilityCoverage?.withheldAbilities} more descriptions are withheld pending source-token and difficulty-variant verification.`,
                )}</div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className={styles.pageFooter}>
          <span><Users aria-hidden="true" />{t("9 боссов в трех рейдах Midnight", "9 bosses across three Midnight raids")}</span>
          <span><Database aria-hidden="true" />{t("Названия и описания: Журнал приключений WoW", "Names and descriptions: WoW Adventure Guide")}</span>
        </footer>
      </div>
    </main>
  );
}
