import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Castle,
  Check,
  ChevronRight,
  ExternalLink,
  Gem,
  MapPin,
  ShieldCheck,
  Skull,
  Sparkles,
  Trophy,
} from "lucide-react";
import contentManifest from "@/data/wow/content-manifest.json";
import { preloadSharedWowBackdrop } from "@/lib/wow/sharedBackdropPreload";
import {
  gloryAchievements,
  headlineRewards,
  raidFinderWings,
  raidLootBands,
  tierRewards,
  venomousRaidLocationSource,
  venomousRaidLootSource,
  venomousRaidOverviewSource,
  venomousRaidVerifiedAt,
} from "./venomousAbyssIntel";
import styles from "./venomousAbyssPage.module.css";

type Locale = "ru" | "en";

type ManifestIdentity = {
  id: string;
  canonicalSlug: string;
  instance?: string;
  order?: number;
  build: string | null;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  refs: { encounterId: number | null; journalId: number | null };
};

type ManifestAbility = { parentId: string; descriptionVerificationStatus?: string };
type ManifestPhase = { parentId: string };

const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss") as ManifestIdentity | undefined;
const bosses = (contentManifest.encounters as ManifestIdentity[])
  .filter((entry) => entry.instance === "venomous-abyss")
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const bossIds = new Set(bosses.map((boss) => boss.id));
const abilities = (contentManifest.abilities as ManifestAbility[]).filter((ability) => bossIds.has(ability.parentId));
const phases = (contentManifest.phases as ManifestPhase[]).filter((phase) => bossIds.has(phase.parentId));
const verifiedDescriptions = abilities.filter((ability) => ability.descriptionVerificationStatus === "verified");

export function VenomousAbyssPage({ locale }: { locale: Locale }) {
  preloadSharedWowBackdrop();
  const prefix = locale === "ru" ? "/ru" : "";
  const t = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;
  if (!raid?.names.en || !raid.names.ru || !raid.descriptions.en || !raid.descriptions.ru || !raid.build || bosses.length !== 8) {
    throw new Error("Verified Venomous Abyss identity projection is incomplete");
  }
  const localized = (value: { en: string | null; ru: string | null }) => locale === "ru" ? value.ru : value.en;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Image src="/assets/wow/mythic/backgrounds/altar.webp" alt="" fill preload sizes="100vw" />
        <div className={styles.heroShade} />
        <div className={styles.heroFrame}>
          <nav className={styles.breadcrumbs} aria-label={t("Хлебные крошки", "Breadcrumb")}>
            <Link href={`${prefix}/wow/raids`} prefetch={false}><ArrowLeft aria-hidden="true" />{t("Рейдовый журнал", "Raid journal")}</Link>
            <ChevronRight aria-hidden="true" /><span>{localized(raid.names)}</span>
          </nav>
          <div className={styles.heroCopy}>
            <p><Sparkles aria-hidden="true" /> Midnight Season 2 · Patch 12.1</p>
            <h1>{localized(raid.names)}</h1>
            <div className={styles.location}><MapPin aria-hidden="true" />The Coiled Isle · Vaults of Atal’Utek</div>
            <p className={styles.lead}>{localized(raid.descriptions)}</p>
            <div className={styles.difficulties}><span>Story</span><span>LFR</span><span>Normal</span><span>Heroic</span><span>Mythic</span></div>
          </div>
          <dl className={styles.raidFacts}>
            <div><dt>8</dt><dd>{t("боссов", "bosses")}</dd></div>
            <div><dt>12.1</dt><dd>{t("обновление", "patch")}</dd></div>
            <div><dt>{raid.build.split(".").at(-1)}</dt><dd>{t("сборка", "build")}</dd></div>
          </dl>
        </div>
      </section>

      <div className={styles.frame}>
        <section className={styles.liveBanner}><i /><div><b>{t("Рейд полностью открыт", "The full raid is now open")}</b><span>{t("Доступны все сложности и четыре крыла Поиска рейда.", "All difficulties and all four Raid Finder wings are available.")}</span></div><Link href={`${prefix}/wow/midnight/season-2`} prefetch={false}><CalendarDays aria-hidden="true" />{t("Календарь сезона", "Season calendar")}</Link></section>

        <section className={styles.coverage} aria-labelledby="raid-coverage-title" data-testid="raid-data-coverage">
          <header className={styles.sectionHeader}><div><p>{t("Покрытие данных", "Data coverage")}</p><h2 id="raid-coverage-title">{t("Что подтверждено сейчас", "What is verified now")}</h2></div><span><ShieldCheck aria-hidden="true" /> {venomousRaidVerifiedAt}</span></header>
          <dl>
            <div><dt>{bosses.length}</dt><dd>{t("встреч с EN/RU идентичностью", "encounters with EN/RU identity")}</dd></div>
            <div><dt>{abilities.length}</dt><dd>{t("способностей со Spell ID и иконкой", "abilities with Spell ID and icon")}</dd></div>
            <div><dt>{verifiedDescriptions.length}</dt><dd>{t("проверенных двуязычных описаний", "verified bilingual descriptions")}</dd></div>
            <div><dt>{phases.length}</dt><dd>{t("явных заголовков фаз Journal", "explicit Journal phase headings")}</dd></div>
          </dl>
          <p>{t(
            `${abilities.length - verifiedDescriptions.length} описаний остаются скрыты из-за неразрешённых клиентских токенов. Тактические назначения помечены source_tracked и не считаются данными Blizzard Journal.`,
            `${abilities.length - verifiedDescriptions.length} descriptions remain withheld because of unresolved client tokens. Tactical assignments are marked source_tracked and are not presented as Blizzard Journal data.`,
          )}</p>
        </section>

        <section className={styles.encounters} aria-labelledby="encounters-title">
          <header className={styles.sectionHeader}><div><p>{t("Журнал встреч", "Encounter journal")}</p><h2 id="encounters-title">{t("Путь к Ула’тек", "The path to Ula’tek")}</h2></div><span><Skull aria-hidden="true" /> 8 / 8</span></header>
          <ol>
            {bosses.map((boss, index) => {
              const bossAbilities = abilities.filter((ability) => ability.parentId === boss.id);
              const bossDescriptions = bossAbilities.filter((ability) => ability.descriptionVerificationStatus === "verified").length;
              const tierReward = tierRewards[boss.canonicalSlug];
              return <li key={boss.canonicalSlug}>
                <div className={styles.bossLink}>
                  <div className={styles.bossNumber}>{String(index + 1).padStart(2, "0")}</div>
                  <span className={styles.bossSigil} role="img" aria-label={t("Портрет NPC не проверен", "NPC portrait not verified")}><Skull aria-hidden="true" /></span>
                  <Link className={styles.bossCopy} href={`${prefix}/wow/raids/venomous-abyss/${boss.canonicalSlug}`} prefetch={false}>
                    <small>{t(`Встреча ${boss.order}`, `Encounter ${boss.order}`)} · Encounter ID {boss.refs.encounterId}</small>
                    <h3>{localized(boss.names)}</h3>
                    <p>{localized(boss.descriptions)}</p>
                    <span className={styles.bossMeta}>{bossAbilities.length} {t("способностей", "abilities")} · {bossDescriptions} {t("описаний", "descriptions")}{tierReward ? <> · <b>{tierReward[locale]}</b></> : null}</span>
                  </Link>
                  <Link className={styles.bossStatus} href={`${prefix}/wow/raids/venomous-abyss/${boss.canonicalSlug}`} prefetch={false}>{t("Открыть гайд", "Open guide")}<ChevronRight aria-hidden="true" /></Link>
                </div>
              </li>;
            })}
          </ol>
        </section>

        <section className={styles.splitSection}>
          <div className={styles.wings}>
            <header className={styles.sectionHeader}><div><p>{t("Поиск рейда", "Raid Finder")}</p><h2>{t("Крылья и даты", "Wings and dates")}</h2></div></header>
            <ol>{raidFinderWings.map((wing, index) => <li key={wing.number}><span>0{index + 1}</span><Castle aria-hidden="true" /><div><time>{t(wing.dateRu, wing.dateEn)}</time><h3>{wing.name}</h3><p>{wing.bosses.join(" · ")}</p></div><Check aria-hidden="true" /></li>)}</ol>
          </div>
          <aside className={styles.entryCard}>
            <Castle aria-hidden="true" />
            <p>{t("Вход в рейд", "Raid entrance")}</p>
            <h2>Vaults of Atal’Utek</h2>
            <span>{t("Источники указывают разные точки внутри Vaults of Atal’Utek. Обе сохранены с указанием источника — проверьте маркер на своей карте.", "Sources publish different points inside the Vaults of Atal’Utek. Both are preserved with attribution—confirm the marker on your map.")}</span>
            <code>/way #2509 47.11 28.30</code>
            <small><MapPin aria-hidden="true" /> <a href={venomousRaidOverviewSource} target="_blank" rel="noreferrer">Icy Veins</a></small>
            <code>/way #2509 47.2 21.7</code>
            <small><MapPin aria-hidden="true" /> <a href={venomousRaidLocationSource} target="_blank" rel="noreferrer">Wowhead</a></small>
          </aside>
        </section>

        <section className={styles.loot} aria-labelledby="loot-title">
          <header className={styles.sectionHeader}><div><p>{t("Экипировка", "Gear progression")}</p><h2 id="loot-title">{t("Уровни добычи по группам боссов", "Loot levels by boss band")}</h2></div><span><Gem aria-hidden="true" /> ilvl 279–344</span></header>
          <div className={styles.tableWrap} role="region" aria-label={t("Таблица уровней добычи рейда", "Raid loot-level table")} tabIndex={0}>
            <table data-testid="raid-loot-bands">
              <thead><tr><th>{t("Сложность", "Difficulty")}</th><th>{t("Босс 1", "Boss 1")}</th><th>{t("Боссы 2–3", "Bosses 2–3")}</th><th>{t("Боссы 4–6", "Bosses 4–6")}</th><th>{t("Боссы 7–8", "Bosses 7–8")}</th><th>{t("Трек", "Track")}</th></tr></thead>
              <tbody>{raidLootBands.map((row) => <tr key={row.difficulty.en}><th>{row.difficulty[locale]}</th>{row.levels.map((level) => <td key={`${row.difficulty.en}-${level}`} className={level === 344 ? styles.apexLoot : undefined}>ilvl {level}</td>)}<td>{row.track}</td></tr>)}</tbody>
            </table>
          </div>
          <div className={styles.lootNotes}>
            <div><Gem aria-hidden="true" /><span><b>{t("Tier-токены", "Tier tokens")}</b><small>{Object.entries(tierRewards).map(([slug, reward]) => `${bosses.find((boss) => boss.canonicalSlug === slug)?.names.en}: ${reward[locale]}`).join(" · ")}</small></span></div>
            <div><Trophy aria-hidden="true" /><span><b>Primeval Skyfriend</b><small>{t("Награда за эпохальную Ула'тек. Источник сообщает о трёх маунтах за убийство до выхода следующего дополнения.", "Mythic Ula'tek reward. The source reports three mounts per kill until the next expansion releases.")}</small></span></div>
            <div><BookOpen aria-hidden="true" /><span><b>{t("Честный статус шанса", "Honest chance status")}</b><small>{t("Это таблица уровней, а не список предметов. Проценты выпадения не вычисляются: точный шанс не опубликован.", "This is an item-level table, not an item list. Drop percentages are not inferred: the exact chance has not been published.")}</small></span></div>
          </div>
          <p className={styles.sectionSource}><ShieldCheck aria-hidden="true" />{t("Проверено", "Verified")} {venomousRaidVerifiedAt} · <a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{t("Источник уровней и tier-слотов", "Item-level and tier-slot source")}<ExternalLink aria-hidden="true" /></a></p>
        </section>

        <section className={styles.achievements} aria-label={t("Главные награды рейда", "Headline raid rewards")}>
          {headlineRewards.map((reward) => <div key={reward.name}><Trophy className={styles.achievementIcon} aria-hidden="true" /><p>{t("Награда рейда", "Raid reward")}</p><h2>{reward.name}</h2><span>{reward.detail[locale]}</span></div>)}
        </section>

        <section className={styles.glory} aria-labelledby="glory-title">
          <header className={styles.sectionHeader}><div><p>Glory of the Venomous Raider</p><h2 id="glory-title">{t("Условия восьми достижений", "Eight achievement requirements")}</h2></div><span><Trophy aria-hidden="true" /> 8 / 8</span></header>
          <ol data-testid="raid-glory-requirements">{gloryAchievements.map((achievement, index) => <li key={achievement.name}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{achievement.name}</h3><p>{achievement.requirement[locale]}</p></div></li>)}</ol>
          <p className={styles.sectionSource}><ShieldCheck aria-hidden="true" />{t("Награда мета-достижения: Crimson Venomfang", "Meta-achievement reward: Crimson Venomfang")} · <a href={venomousRaidOverviewSource} target="_blank" rel="noreferrer">{t("Источник", "Source")}<ExternalLink aria-hidden="true" /></a></p>
        </section>

        <footer className={styles.sourceBar}>
          <BookOpen aria-hidden="true" /><span><b>{t("Идентичность, локализация и обзор наград проверены", "Identity, localization, and reward overview verified")}</b><small>Journal DB2 · {raid.build} · {venomousRaidVerifiedAt}</small></span>
          <a href="https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live" target="_blank" rel="noreferrer">{t("Официальный источник", "Official source")}<ExternalLink aria-hidden="true" /></a>
        </footer>
      </div>
    </main>
  );
}
