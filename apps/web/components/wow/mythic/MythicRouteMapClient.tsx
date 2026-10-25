"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import { AtlasBreadcrumbs } from "@gildra/atlas-ui/AtlasBreadcrumbs";
import { sourceName, type WowNameTable } from "@/lib/wow/wowNameTable";
import type { DungeonRoute, DungeonSelectorOption } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections, dungeonBackdropSmall, dungeonBackdropMobile, dungeonAtmospheres } from "@/lib/wow/dungeonArtDirection";
import { dungeonBackdropSource } from "@/lib/wow/dungeonBackdropSource";
import { RubySanctuaryFooter } from "./RubySanctuaryFooter";
import { RubySanctuaryWeather } from "./RubySanctuaryWeather";
import { DungeonAtmosphere } from "./DungeonAtmosphere";
import { DungeonTalentCalculatorButton } from "./DungeonTalentCalculatorButton";
import { MythicRouteSelectors } from "./MythicRouteSelectors";
import { mythicRouteCopy, type RouteLocale } from "./mythicRouteCopy";
import type { DungeonCombatIntel } from "./dungeonCombatIntel.types";
import { RouteNamesContext, useRouteNameTable } from "./routeNames";
import { dungeonThemeClass } from "./dungeonTheme";
import styles from "./mythicRouteMap.module.css";

const MdtPullMap = dynamic(() => import("./MdtPullMap"), { ssr: false, loading: () => <div className={styles.mdtLoading} role="status"><span>MDT…</span></div> });
const locations = { "ruby-life-pools": "Dragon Isles", "altar-of-fangs": "The Coiled Isle", "murder-row": "Silvermoon", "den-of-nalorakk": "Zul'Aman", "the-blinding-vale": "Harandar", "voidscar-arena": "Voidstorm", "kings-rest": "Zuldazar", "temple-of-sethraliss": "Vol'dun" };

export function MythicRouteMapClient({ locale, dungeon, dungeonOptions, combatIntel, names: pageNames }: { locale: RouteLocale; dungeon: DungeonRoute; dungeonOptions: DungeonSelectorOption[]; combatIntel: DungeonCombatIntel; names: WowNameTable }) {
  const copy = mythicRouteCopy[locale], localePrefix = locale === "ru" ? "/ru" : "";
  const names = useRouteNameTable(locale, pageNames, dungeon.stops, dungeon.stops);
  const dungeonName = sourceName(names, dungeon.name, locale, dungeon.nameRu);
  const bossCount = dungeon.stops.filter(stop => stop.kind === "boss").length;
  const [keyLevel, setKeyLevel] = useState(12);
  const themeClassName = dungeonThemeClass(dungeon.slug);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`gildra:mythic:${dungeon.slug}:v3`) ?? "null");
      if (Number.isInteger(saved?.keyLevel) && saved.keyLevel >= 2 && saved.keyLevel <= 30) setKeyLevel(saved.keyLevel);
    } catch { /* A malformed old draft must never block the current map. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [dungeon.slug]);

  return (
    <RouteNamesContext.Provider value={names}>
    <main
      className={`${styles.page} ${themeClassName}`}
      data-dungeon={dungeon.slug}
      style={{ "--dungeon-accent": dungeonArtDirections[dungeon.slug].accent, "--dungeon-glow": dungeonArtDirections[dungeon.slug].glow } as CSSProperties}
    >
      <div className={styles.backdrop} data-testid="dungeon-backdrop" aria-hidden="true"><div className={styles.backdropScene}>
        <picture>
          <source media="(max-width: 720px)" srcSet={dungeonBackdropMobile(dungeon.slug)} />
          <img className={styles.backdropImage} src={dungeonBackdropSource(dungeon)} srcSet={`${dungeonBackdropSmall(dungeon.slug)} 768w, ${dungeonBackdropSource(dungeon)} 1448w`} sizes="100vw" alt="" width={1448} height={1086} fetchPriority="high" decoding="async" />
        </picture>
        {dungeon.slug === "ruby-life-pools" ? <RubySanctuaryWeather /> : <DungeonAtmosphere kind={dungeonAtmospheres[dungeon.slug]} />}
      </div></div>
      <div className={styles.column}>
        <div className={styles.crumbsRow}>
          <AtlasBreadcrumbs label={copy.breadcrumbsLabel} items={[{ label: copy.hub, href: `${localePrefix}/wow/mythic-plus` }, { label: dungeonName }]} />
          <span className={styles.season}>{copy.season}</span>
        </div>

        <section className={styles.intro} aria-labelledby="route-title">
          <div className={styles.introIdentity}>
            <p className={styles.eyebrow}>{locale === "ru" ? `Маршрут подземелья · ${dungeon.location}` : `Dungeon route · ${locations[dungeon.slug]}`}</p>
            <div className={styles.titleRow}>
              <h1 id="route-title">{dungeonName}</h1>
              <span className={styles.keyTag} aria-label={`${copy.keyLevelLabel} +${keyLevel}`}>+{keyLevel}</span>
            </div>
            <p className={styles.description}><strong>{copy.goal}</strong> {copy.goalText(dungeon.description, bossCount)}</p>
          </div>
          <div className={styles.routeControls} role="group" aria-label={copy.controlsLabel}>
            <DungeonTalentCalculatorButton locale={locale} themeClassName={themeClassName} />
            <div className={styles.selectorRow}>
              <MythicRouteSelectors locale={locale} dungeonSlug={dungeon.slug} dungeonOptions={dungeonOptions} keyLevel={keyLevel} onKeyLevelChange={setKeyLevel} />
            </div>

          </div>
        </section>

        <div className={styles.panel}><MdtPullMap key={dungeon.slug} slug={dungeon.slug} locale={locale} routeUrl={dungeon.mdtRouteUrl} data={combatIntel.mdt} stops={dungeon.stops} combatIntel={combatIntel} /></div>
        <RubySanctuaryFooter locale={locale} />
      </div>

    </main>
    </RouteNamesContext.Provider>
  );
}
