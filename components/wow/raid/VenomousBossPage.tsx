"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  Gem,
  HeartPulse,
  Map,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import type { BossGuide, Difficulty, Lang, LocalText } from "@/data/venomousAbyss";
import {
  lootBandIndexForBoss,
  raidLootBands,
  tierRewards,
  venomousRaidLootSource,
  venomousRaidVerifiedAt,
} from "./venomousAbyssIntel";
import styles from "./venomousBossPage.module.css";

const difficulties: Difficulty[] = ["normal", "heroic", "mythic"];
const lt = (value: LocalText, lang: Lang) => value[lang];

const difficultyLabel: Record<Lang, Record<Difficulty, string>> = {
  en: { normal: "Normal", heroic: "Heroic", mythic: "Mythic" },
  ru: { normal: "Обычный", heroic: "Героический", mythic: "Эпохальный" },
};

const roleIcons = {
  tank: Shield,
  healer: HeartPulse,
  dps: Swords,
} as const;

function ArenaPlan({ boss, locale }: { boss: BossGuide; locale: Lang }) {
  const t = <T,>(ru: T, en: T) => (locale === "ru" ? ru : en);
  return (
    <div
      className={`${styles.arena} ${styles[`arena_${boss.layout}`]}`}
      role="img"
      aria-label={lt(boss.positioning, locale)}
    >
      <span className={styles.arenaRingOne} />
      <span className={styles.arenaRingTwo} />
      <span className={styles.arenaBoss}><Skull aria-hidden="true" /><b>{t("БОСС", "BOSS")}</b></span>
      <span className={`${styles.arenaTank} ${styles.tankOne}`}>T1</span>
      <span className={`${styles.arenaTank} ${styles.tankTwo}`}>T2</span>
      <span className={`${styles.arenaGroup} ${styles.groupOne}`}>{t("ГРУППА A", "GROUP A")}</span>
      <span className={`${styles.arenaGroup} ${styles.groupTwo}`}>{t("ГРУППА B", "GROUP B")}</span>
      <span className={`${styles.danger} ${styles.dangerOne}`}>×</span>
      <span className={`${styles.danger} ${styles.dangerTwo}`}>×</span>
      <span className={`${styles.arenaArrow} ${styles.arrowOne}`}>→</span>
      <span className={`${styles.arenaArrow} ${styles.arrowTwo}`}>→</span>
    </div>
  );
}

export function VenomousBossPage({
  boss,
  locale,
  previous,
  next,
}: {
  boss: BossGuide;
  locale: Lang;
  previous?: BossGuide;
  next?: BossGuide;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("heroic");
  const selected = boss.difficulty[difficulty];
  const comp = boss.composition[difficulty];
  const prefix = locale === "ru" ? "/ru" : "";
  const t = <T,>(ru: T, en: T) => (locale === "ru" ? ru : en);
  const bossName = lt(boss.name, locale);
  const verifiedDescriptionCount = boss.journalAbilities.filter((ability) => ability.description).length;
  const lootBandIndex = lootBandIndexForBoss(boss.number);
  const tierReward = tierRewards[boss.slug];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Image src="/assets/wow/mythic/backgrounds/altar.webp" alt="" fill preload sizes="100vw" />
        <div className={styles.heroShade} />
        <div className={styles.heroFrame}>
          <nav className={styles.breadcrumbs} aria-label={t("Хлебные крошки", "Breadcrumb")}>
            <Link href={`${prefix}/wow/raids/venomous-abyss`} prefetch={false}><ArrowLeft aria-hidden="true" />The Venomous Abyss</Link>
            <ChevronRight aria-hidden="true" /><span>{bossName}</span>
          </nav>
          <div className={styles.heroCopy}>
            <p><Sparkles aria-hidden="true" />{t(`БОСС ${boss.number} ИЗ 8`, `BOSS ${boss.number} OF 8`)} · {lt(boss.type, locale)}</p>
            <h1>{bossName}</h1>
            <p className={styles.lead}>{lt(boss.identityDescription, locale)}</p>
            <div className={styles.pull}><Skull aria-hidden="true" />{lt(boss.pull, locale)}<small>{t("Портрет NPC не проверен", "NPC portrait not verified")}</small></div>
          </div>
          <div className={styles.bossNumber} aria-hidden="true"><span>{String(boss.number).padStart(2, "0")}</span><small>/ 08</small></div>
        </div>
      </section>

      <div className={styles.frame}>
        <section className={styles.verificationNotice} aria-label={t("Статус проверки", "Verification status")}>
          <BookOpen aria-hidden="true" />
          <div>
            <b>{t("Черновик тактики из стороннего источника", "Third-party strategy draft")}</b>
            <span>{t(
              `Идентичность встречи и локализация проверены по Journal DB2 для ${boss.build}. Назначения, тайминги, схема и различия сложностей пока имеют статус source_tracked и не считаются проверенными.`,
              `Encounter identity and localization are verified against Journal DB2 for ${boss.build}. Assignments, timings, arena plan, and difficulty deltas remain source_tracked and are not verified.`,
            )}</span>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.abilities}`} aria-labelledby="abilities-title">
          <header className={styles.panelHeader}>
            <BookOpen aria-hidden="true" />
            <div>
              <p>{t("ПРОВЕРЕННЫЕ ИДЕНТИФИКАТОРЫ", "VERIFIED IDENTITIES")}</p>
              <h2 id="abilities-title">{t("Способности из обзора журнала", "Encounter Journal overview abilities")}</h2>
            </div>
          </header>
          <p className={styles.abilityDisclosure}>{t(
            `Названия, spell ID и соответствующие иконки проверены. Для ${verifiedDescriptionCount} из ${boss.journalAbilities.length} способностей доступно двуязычное описание без неразрешённых клиентских токенов в сборке ${boss.build}; остальные описания, все теги механик и инструкции скрыты до проверки.`,
            `Names, spell IDs, and matching icons are verified. ${verifiedDescriptionCount} of ${boss.journalAbilities.length} abilities have bilingual descriptions without unresolved client tokens in build ${boss.build}; other descriptions, all mechanic tags, and execution instructions remain withheld pending verification.`,
          )}</p>
          <div className={styles.abilityGrid} role="list" data-testid="verified-ability-list">
            {boss.journalAbilities.map((ability) => (
              <article
                key={ability.spellId}
                role="listitem"
                data-testid="verified-ability"
                data-spell-id={ability.spellId}
                data-description-status={ability.descriptionVerificationStatus}
              >
                <Image src={ability.iconUrl} alt="" width={48} height={48} sizes="48px" />
                <span>
                  <b>{lt(ability.name, locale)}</b>
                  <small>Spell ID {ability.spellId} · Icon ID {ability.iconId}</small>
                  <small>{ability.iconSourceKind === "blizzard_api" ? "Blizzard API" : "Wago CASC"} · {boss.build}</small>
                  {ability.description ? (
                    <p className={styles.abilityDescription} data-testid="verified-ability-description">{lt(ability.description, locale)}</p>
                  ) : (
                    <small className={styles.abilityWithheld} data-testid="withheld-ability-description">{t(
                      "Описание скрыто: исходник содержит неразрешённые клиентские токены",
                      "Description withheld: source contains unresolved client tokens",
                    )}</small>
                  )}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.panel} ${styles.phaseEvidence}`} aria-labelledby="journal-phases-title">
          <header className={styles.panelHeader}>
            <Clock3 aria-hidden="true" />
            <div>
              <p>{t("ПРОВЕРЕННАЯ СТРУКТУРА", "VERIFIED STRUCTURE")}</p>
              <h2 id="journal-phases-title">{t("Заголовки фаз из журнала", "Encounter Journal phase headings")}</h2>
            </div>
          </header>
          {boss.journalPhases.length ? (
            <>
              <p className={styles.abilityDisclosure}>{t(
                `В Journal DB2 для ${boss.build} явно указано разделов: ${boss.journalPhases.length}. Проверены только названия и порядок; тайминги, описания и механики не выводятся из структуры разделов.`,
                `Journal DB2 for ${boss.build} explicitly labels ${boss.journalPhases.length} sections. Only titles and order are verified; timing, descriptions, and mechanics are not inferred from the section tree.`,
              )}</p>
              <ol className={styles.journalPhaseList}>
                {boss.journalPhases.map((phase) => (
                  <li key={phase.journalSectionId} data-verification-status="identity_only">
                    <span>{String(phase.order).padStart(2, "0")}</span>
                    <div>
                      <b>{lt(phase.name, locale)}</b>
                      <small>Journal Section ID {phase.journalSectionId} · {phase.phaseKind} · {boss.build}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className={styles.abilityDisclosure}>{t(
              `В дереве Journal DB2 для ${boss.build} нет явных двуязычных заголовков stage/phase/intermission. Фазы не были выведены из черновика тактики.`,
              `The Journal DB2 tree for ${boss.build} has no explicit bilingual stage/phase/intermission headings. No phases were inferred from the strategy draft.`,
            )}</p>
          )}
        </section>

        <section className={styles.difficultyWorkspace} aria-labelledby="difficulty-title">
          <header>
            <div><p>{t("ПЛАН НА БОЯ", "ENCOUNTER PLAN")}</p><h2 id="difficulty-title">{t("Выберите сложность", "Choose difficulty")}</h2></div>
            <div className={styles.difficultyTabs} role="tablist" aria-label={t("Сложность рейда", "Raid difficulty")}>
              {difficulties.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={difficulty === mode}
                  className={difficulty === mode ? styles.activeTab : undefined}
                  onClick={() => setDifficulty(mode)}
                >
                  {difficultyLabel[locale][mode]}
                </button>
              ))}
            </div>
          </header>
          <div className={`${styles.difficultyDetail} ${styles[`mode_${difficulty}`]}`} role="tabpanel" aria-live="polite">
            <span className={styles.modeRune}>{difficulty.slice(0, 1).toUpperCase()}</span>
            <div><small>{difficultyLabel[locale][difficulty]}</small><h3>{lt(selected.headline, locale)}</h3></div>
            <ul>{selected.changes.map((change, index) => <li key={index}>{lt(change, locale)}</li>)}</ul>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={`${styles.panel} ${styles.roles}`} aria-labelledby="roles-title">
            <header className={styles.panelHeader}><Shield aria-hidden="true" /><div><p>{t("НАЗНАЧЕНИЯ", "ASSIGNMENTS")}</p><h2 id="roles-title">{t("Механики по ролям", "Mechanics by role")}</h2></div></header>
            <div className={styles.roleGrid}>
              {(["tank", "healer", "dps"] as const).map((role) => {
                const RoleIcon = roleIcons[role];
                return (
                  <article key={role}>
                    <h3><RoleIcon aria-hidden="true" />{role === "tank" ? t("Танки", "Tanks") : role === "healer" ? t("Лекари", "Healers") : t("Бойцы", "Damage")}</h3>
                    <ul>{boss.roles[role].map((item, index) => <li key={index}>{lt(item, locale)}</li>)}</ul>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.timeline}`} aria-labelledby="timeline-title">
            <header className={styles.panelHeader}><Clock3 aria-hidden="true" /><div><p>{t("ПОСЛЕДОВАТЕЛЬНОСТЬ", "SEQUENCE")}</p><h2 id="timeline-title">{t("Таймлайн", "Timeline")}</h2></div></header>
            <ol>
              {boss.timeline.map((event, index) => (
                <li key={`${event.marker}-${index}`}><span className={styles.timelineMarker} aria-label={`${t("Шаг", "Step")} ${index + 1}: ${event.marker}`}>{event.marker}</span><div><b>{lt(event.title, locale)}</b><small>{lt(event.detail, locale)}</small></div></li>
              ))}
            </ol>
            <p className={styles.note}>{t("Маркеры показывают порядок; точное время сдвигается от урона группы.", "Markers show mechanic order; exact timing shifts with group damage.")}</p>
          </section>

          <section className={`${styles.panel} ${styles.position}`} aria-labelledby="position-title">
            <header className={styles.panelHeader}><Map aria-hidden="true" /><div><p>{t("СХЕМА АРЕНЫ", "ARENA PLAN")}</p><h2 id="position-title">{t("Позиционирование", "Positioning")}</h2></div></header>
            <ArenaPlan boss={boss} locale={locale} />
            <p className={styles.note}>{lt(boss.positioning, locale)}</p>
          </section>

          <section className={`${styles.panel} ${styles.composition}`} aria-labelledby="composition-title">
            <header className={styles.panelHeader}><Users aria-hidden="true" /><div><p>{t("РЕКОМЕНДАЦИЯ", "RECOMMENDED")}</p><h2 id="composition-title">{t("Состав", "Composition")}</h2></div></header>
            <div className={styles.compNumbers}>
              <span><Shield aria-hidden="true" /><b>{comp.tanks}</b><small>{t("ТАНКА", "TANKS")}</small></span>
              <span><HeartPulse aria-hidden="true" /><b>{comp.healers}</b><small>{t("ЛЕКАРЯ", "HEALERS")}</small></span>
              <span><Swords aria-hidden="true" /><b>{comp.dps}</b><small>DPS</small></span>
            </div>
            <p className={styles.note}>{lt(comp.note, locale)}</p>
          </section>

          <section className={`${styles.panel} ${styles.loot}`} aria-labelledby="loot-title">
            <header className={styles.panelHeader}><Gem aria-hidden="true" /><div><p>{t("ПРОВЕРЕННАЯ ГРУППА НАГРАД", "VERIFIED REWARD BAND")}</p><h2 id="loot-title">{t("Уровни предметов встречи", "Encounter item levels")}</h2></div></header>
            <div className={styles.lootTableWrap} role="region" aria-label={t(`Уровни предметов: ${bossName}`, `${bossName} item levels`)} tabIndex={0}>
              <table data-testid="encounter-loot-band">
                <thead><tr><th>{t("Сложность", "Difficulty")}</th><th>ilvl</th><th>{t("Трек", "Track")}</th></tr></thead>
                <tbody>
                  {raidLootBands.map((row) => (
                    <tr key={row.difficulty.en}>
                      <th>{row.difficulty[locale]}</th>
                      <td>{row.levels[lootBandIndex]}</td>
                      <td>{row.track}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tierReward ? <p className={styles.tierReward}><Gem aria-hidden="true" /><span><b>{t("Tier-награда встречи", "Encounter tier reward")}</b>{tierReward[locale]}</span></p> : null}
            <p className={styles.note}>{t(
              "Это проверенная группа уровней, а не список предметов. Строки добычи скрыты, пока для них не проверены canonical itemId, источник встречи, сложность, трек улучшения и chanceStatus. Точный шанс выпадения не опубликован.",
              "This is a verified item-level band, not an item list. Loot rows are withheld until their canonical itemId, encounter source, difficulty, upgrade track, and chanceStatus are verified. The exact drop chance has not been published.",
            )}</p>
            <a className={styles.lootSource} href={venomousRaidLootSource} target="_blank" rel="noreferrer">{t(`Источник · проверено ${venomousRaidVerifiedAt}`, `Source · verified ${venomousRaidVerifiedAt}`)}<ExternalLink aria-hidden="true" /></a>
          </section>
        </div>

        <footer className={styles.sourceBar}>
          <BookOpen aria-hidden="true" /><span><b>{t("Тактика: source_tracked, не проверена", "Strategy: source_tracked, not verified")}</b><small>{t("Идентичность Journal проверена 13 сентября 2026", "Journal identity verified September 13, 2026")}</small></span>
          <a href={boss.source} target="_blank" rel="noreferrer">{t("Сторонний черновик", "Third-party draft source")}<ExternalLink aria-hidden="true" /></a>
        </footer>

        <nav className={styles.pager} aria-label={t("Другие боссы", "Other bosses")}>
          {previous ? <Link href={`${prefix}/wow/raids/venomous-abyss/${previous.slug}`} prefetch={false}><ChevronLeft aria-hidden="true" /><span><small>{t("ПРЕДЫДУЩИЙ", "PREVIOUS")}</small><b>{lt(previous.name, locale)}</b></span></Link> : <span />}
          <Link className={styles.allBosses} href={`${prefix}/wow/raids/venomous-abyss`} prefetch={false}>{t("Все боссы", "All bosses")}</Link>
          {next ? <Link className={styles.next} href={`${prefix}/wow/raids/venomous-abyss/${next.slug}`} prefetch={false}><span><small>{t("СЛЕДУЮЩИЙ", "NEXT")}</small><b>{lt(next.name, locale)}</b></span><ChevronRight aria-hidden="true" /></Link> : <span />}
        </nav>
      </div>
    </main>
  );
}
