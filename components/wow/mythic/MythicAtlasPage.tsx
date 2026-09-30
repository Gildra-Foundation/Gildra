import Image from "next/image";
import { BookOpen, ChevronRight, Clock3, Database, Gem, MapPin, Route, ShieldCheck, Skull, Sparkles } from "lucide-react";
import { dungeonRoutes, dungeonSlugs } from "./dungeonRoutes";
import styles from "./mythicAtlasPage.module.css";
import { preloadSharedWowBackdrop } from "@/lib/wow/sharedBackdropPreload";

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MythicAtlasPage({ locale }: { locale: "ru" | "en" }) {
  preloadSharedWowBackdrop();
  const prefix = locale === "ru" ? "/ru" : "";
  const t = <T,>(ru: T, en: T) => locale === "ru" ? ru : en;

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.hero}>
          <div className={styles.keystoneSeal}><Gem aria-hidden="true" /></div>
          <div className={styles.heroCopy}>
            <span><Sparkles aria-hidden="true" /> World of Warcraft · Midnight</span>
            <h1>{t("Атлас Mythic+", "Mythic+ atlas")}</h1>
            <p>{t("Выберите подземелье и откройте интерактивный маршрут: пулы, боссы, таймер, состав группы и тактические назначения.", "Choose a dungeon and open its interactive route with pulls, bosses, timer, party composition, and tactical assignments.")}</p>
          </div>
          <dl>
            <div><dt>8</dt><dd>{t("подземелий", "dungeons")}</dd></div>
            <div><dt>{Object.values(dungeonRoutes).reduce((sum, route) => sum + route.stops.filter((stop) => stop.kind === "boss").length, 0)}</dt><dd>{t("боссов", "bosses")}</dd></div>
            <div><dt>S2</dt><dd>Midnight</dd></div>
          </dl>
        </header>

        <section className={styles.dungeonGrid} aria-label={t("Подземелья Mythic+", "Mythic+ dungeons")}>
          {dungeonSlugs.map((slug, index) => {
            const dungeon = dungeonRoutes[slug];
            const bosses = dungeon.stops.filter((stop) => stop.kind === "boss");
            const abilityCount = new Set(dungeon.stops.flatMap((stop) => stop.abilities.map((ability) => ability.name))).size;
            return (
              <article key={slug} className={styles.card} style={{ "--dungeon-accent": dungeon.accent } as React.CSSProperties}>
                <a className={styles.cardLink} href={`${prefix}/wow/mythic-plus/midnight-season-2/${slug}`} aria-label={`${t("Открыть маршрут", "Open route")}: ${locale === "ru" ? dungeon.nameRu : dungeon.name}`}>
                  <span className={styles.art}>
                    <Image src={dungeon.backdropImage} alt="" fill priority={index === 0} sizes="(max-width: 720px) 100vw, (max-width: 1180px) 50vw, 25vw" />
                    <i className={styles.artShade} />
                    <b className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</b>
                    <span className={styles.timer}><Clock3 aria-hidden="true" />{formatTimer(dungeon.timerSeconds)}</span>
                  </span>
                  <span className={styles.cardBody}>
                    <span className={styles.location}><MapPin aria-hidden="true" />{dungeon.location}<small>Mythic+</small></span>
                    <span className={styles.title}><strong>{locale === "ru" ? dungeon.nameRu : dungeon.name}</strong>{locale === "ru" ? <em>{dungeon.name}</em> : null}</span>
                    <span className={styles.description}>{dungeon.description}</span>
                    <span className={styles.bosses}>
                      {bosses.map((boss, bossIndex) => <span key={boss.id}><i>{bossIndex + 1}</i><b>{boss.title}</b></span>)}
                    </span>
                    <span className={styles.cardFooter}>
                      <span><Route aria-hidden="true" />{dungeon.stops.length} {t("шагов", "stops")}</span>
                      <span><Skull aria-hidden="true" />{bosses.length} {t("босса", "bosses")}</span>
                      <span><Database aria-hidden="true" />{abilityCount} {t("умений", "abilities")}</span>
                      <b>{t("Открыть маршрут", "Open route")}<ChevronRight aria-hidden="true" /></b>
                    </span>
                  </span>
                </a>
              </article>
            );
          })}
        </section>

        <footer className={styles.sourceBar}>
          <BookOpen aria-hidden="true" />
          <span><b>{t("Боевой атлас сезона", "Season combat atlas")}</b><small>{t("Восемь интерактивных маршрутов с сохранением прогресса в браузере", "Eight interactive routes with progress saved in your browser")}</small></span>
          <i><ShieldCheck aria-hidden="true" /> Midnight · Season 2</i>
        </footer>
      </div>
    </main>
  );
}
