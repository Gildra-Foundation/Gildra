import Image from "next/image";
import Link from "next/link";
import { BookOpen, Castle, ChevronRight, Database, ShieldCheck, Skull, Sparkles } from "lucide-react";
import contentManifest from "@/data/wow/content-manifest.json";
import { midnightRaids, raidSlugs } from "./midnightRaidData";
import styles from "./raidAtlasPage.module.css";

type Locale = "ru" | "en";

type ManifestIdentity = {
  canonicalSlug: string;
  instance?: string;
  order?: number;
  build: string | null;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  refs: { encounterId: number | null; journalId: number | null };
  sourceUrl?: string;
  lastVerifiedAt?: string;
  verificationStatus?: string;
};

const currentRaid = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss") as ManifestIdentity | undefined;
const currentBosses = (contentManifest.encounters as ManifestIdentity[])
  .filter((entry) => entry.instance === "venomous-abyss")
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const sporefall = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const rotmire = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");

export function RaidAtlasPage({ locale }: { locale: Locale }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const t = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;
  const localized = (value: { en: string | null; ru: string | null }) => locale === "ru" ? value.ru : value.en;
  const seasonOneBosses = raidSlugs.reduce((total, slug) => total + midnightRaids[slug].bosses.length, 0);
  const publishedRaidCount = raidSlugs.length + 1 + (sporefall ? 1 : 0);
  const publishedBossCount = seasonOneBosses + currentBosses.length + (rotmire ? 1 : 0);

  if (!currentRaid?.names.en || !currentRaid.names.ru || !currentRaid.descriptions.en || !currentRaid.descriptions.ru || currentBosses.length !== 8 || !sporefall?.names.en || !rotmire?.names.en) {
    throw new Error("Raid atlas identity projection is incomplete");
  }

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.hero}>
          <div className={styles.journalSeal}><BookOpen aria-hidden="true" /></div>
          <div>
            <span><Sparkles aria-hidden="true" /> World of Warcraft · Midnight</span>
            <h1>{t("Рейдовый журнал", "Raid journal")}</h1>
            <p>{t(
              "Выберите рейд или конкретного босса. Существующие страницы, портреты и проверенные описания снова доступны в визуальном атласе.",
              "Choose a raid or a specific boss. Existing pages, portraits, and verified descriptions are available in the visual atlas.",
            )}</p>
          </div>
          <dl>
            <div><dt>{publishedRaidCount}</dt><dd>{t("рейдов", "raids")}</dd></div>
            <div><dt>{publishedBossCount}</dt><dd>{t("боссов", "bosses")}</dd></div>
            <div><dt>S2</dt><dd>Midnight</dd></div>
          </dl>
        </header>

        <section aria-labelledby="current-raid-title">
          <header className={styles.expansionHeader}>
            <span><Castle aria-hidden="true" /></span>
            <div><p>{t("Текущий рейд", "Current raid")}</p><h2 id="current-raid-title">Midnight · Season 2</h2></div>
            <small>Patch 12.1 · {currentRaid.build}</small>
          </header>
          <div className={styles.raidGrid}>
            <article className={`${styles.card} ${styles.currentCard}`}>
              <Link className={styles.art} href={`${prefix}/wow/raids/venomous-abyss`} prefetch={false}>
                <Image src="/assets/wow/mythic/backgrounds/altar.webp" alt="" fill preload sizes="(max-width: 720px) 100vw, 65vw" />
                <span className={styles.artShade} />
                <span className={styles.raidNumber}>{t("ТЕКУЩИЙ РЕЙД", "CURRENT RAID")}</span>
                <span className={styles.openLabel}>{t("Открыть журнал", "Open journal")}<ChevronRight aria-hidden="true" /></span>
              </Link>
              <div className={styles.cardBody}>
                <header>
                  <span><ShieldCheck aria-hidden="true" />{t("Идентичность проверена", "Identity verified")}</span>
                  <small>Season 2</small>
                  <h2>{localized(currentRaid.names)}</h2>
                  <p>{localized(currentRaid.descriptions)}</p>
                </header>
                <div className={styles.currentBosses}>
                  {currentBosses.map((boss, index) => (
                    <span key={boss.canonicalSlug}><i>{String(index + 1).padStart(2, "0")}</i><Skull aria-hidden="true" /><b>{localized(boss.names)}</b></span>
                  ))}
                </div>
                <footer><span><Skull aria-hidden="true" />8 {t("боссов", "bosses")}</span><span><Database aria-hidden="true" />Journal #{currentRaid.refs.journalId}</span></footer>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="season-one-title">
          <header className={styles.expansionHeader}>
            <span><Castle aria-hidden="true" /></span>
            <div><p>{t("Архив текущего дополнения", "Current expansion archive")}</p><h2 id="season-one-title">Midnight · Season 1</h2></div>
            <small>{raidSlugs.length + 1} {t("рейда", "raids")} · {seasonOneBosses + 1} {t("боссов", "bosses")}</small>
          </header>
          <div className={styles.raidGrid}>
            {raidSlugs.map((slug, index) => {
              const raid = midnightRaids[slug];
              return (
                <article className={styles.card} style={{ "--raid-accent": raid.accent } as React.CSSProperties} key={slug}>
                  <Link className={styles.art} href={`${prefix}/wow/raids/${slug}`}>
                    <Image src={raid.artwork} alt="" fill sizes="(max-width: 720px) 100vw, 33vw" />
                    <span className={styles.artShade} />
                    <span className={styles.raidNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.openLabel}>{t("Открыть рейд", "Open raid")}<ChevronRight aria-hidden="true" /></span>
                  </Link>
                  <div className={styles.cardBody}>
                    <header>
                      <span><Castle aria-hidden="true" />Midnight · Season 1</span>
                      <small>Journal #{raid.instanceId}</small>
                      <h2>{t(raid.nameRu, raid.nameEn)}</h2>
                      <p>{t(raid.descriptionRu, raid.descriptionEn)}</p>
                    </header>
                    <div className={styles.encounters}>
                      {raid.bosses.map((boss, bossIndex) => (
                        <div className={styles.encounterRow} key={boss.slug}>
                          <i>{String(bossIndex + 1).padStart(2, "0")}</i>
                          <Image src={boss.artwork} alt="" width={17} height={17} />
                          <Link href={`${prefix}/wow/raids/${slug}/${boss.slug}`}>{t(boss.nameRu, boss.nameEn)}</Link>
                        </div>
                      ))}
                    </div>
                    <footer><span><Skull aria-hidden="true" />{raid.bosses.length} {t("боссов", "bosses")}</span><span><Database aria-hidden="true" />Journal #{raid.instanceId}</span></footer>
                  </div>
                </article>
              );
            })}
            <article className={`${styles.card} ${styles.identityCard}`} data-testid="sporefall-identity-card">
              <Link className={`${styles.art} ${styles.neutralArt}`} href={`${prefix}/wow/raids/sporefall`} prefetch={false}>
                <Castle aria-hidden="true" />
                <span className={styles.artShade} />
                <span className={styles.raidNumber}>04 · {t("ТОЛЬКО ИДЕНТИЧНОСТЬ", "IDENTITY ONLY")}</span>
                <span className={styles.openLabel}>{t("Открыть запись", "Open record")}<ChevronRight aria-hidden="true" /></span>
              </Link>
              <div className={styles.cardBody}>
                <header>
                  <span><ShieldCheck aria-hidden="true" />{t("Официальная идентичность", "Official identity")}</span>
                  <small>Patch 12.0.7</small>
                  <h2>{sporefall.names.en}</h2>
                  <p>{t(
                    "Официальное имя рейда подтверждено. Русская локализация, описание, Journal ID, изображения и тактика пока не опубликованы без проверки.",
                    "The official raid name is verified. Russian localization, description, Journal ID, imagery, and strategy remain unpublished pending verification.",
                  )}</p>
                </header>
                <div className={styles.encounters}>
                  <div className={styles.encounterRow}>
                    <i>01</i><Skull aria-hidden="true" />
                    <Link href={`${prefix}/wow/raids/sporefall/rotmire`} prefetch={false}>{rotmire.names.en}</Link>
                  </div>
                </div>
                <footer><span><Skull aria-hidden="true" />1 {t("босс", "boss")}</span><span><Database aria-hidden="true" />{t("ID ожидает проверки", "ID pending")}</span></footer>
              </div>
            </article>
          </div>
        </section>

        <footer className={styles.sourceBar}>
          <BookOpen aria-hidden="true" />
          <span><b>{t("Рейды и страницы боссов восстановлены", "Raid and boss pages restored")}</b><small>{t("Фиксированные страницы остаются доступными; статус проверки показывается внутри каждого рейда.", "Fixed pages remain available; verification status is shown inside each raid.")}</small></span>
          <a href={sporefall.sourceUrl} target="_blank" rel="noreferrer">Sporefall · {t("официальный источник", "official source")}</a>
        </footer>
      </div>
    </main>
  );
}
