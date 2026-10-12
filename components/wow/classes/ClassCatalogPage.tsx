import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasSection } from "@/components/atlas";
import { formatAtlasDate, pluralRu } from "@/components/atlas/format";
import { midnightSpecializations, TALENT_SNAPSHOT } from "@/data/wow/midnight-specializations";
import styles from "./classCatalog.module.css";

type Locale = "en" | "ru";

const copy = {
  ru: {
    breadcrumbs: "Навигация",
    wow: "World of Warcraft",
    title: "Классы и специализации",
    lede: "Все классы Midnight. Выберите специализацию, чтобы открыть её дерево талантов; гайды по классам появятся позже.",
    statsLabel: "Классы и специализации",
    classes: (count: number) => pluralRu(count, "класс", "класса", "классов"),
    specs: (count: number) => pluralRu(count, "специализация", "специализации", "специализаций"),
    section: "Выберите специализацию",
    specsOf: (name: string) => `Специализации: ${name}`,
    openTalents: "дерево талантов",
    source: "Снимок талантов Raidbots",
    note: (build: string, date: string) => `Деревья талантов — снимок данных Raidbots, сборка ${build}, ${date}`,
  },
  en: {
    breadcrumbs: "Breadcrumbs",
    wow: "World of Warcraft",
    title: "Classes and specializations",
    lede: "Every Midnight class. Pick a specialization to open its talent tree; class guides will follow.",
    statsLabel: "Classes and specializations",
    classes: (count: number) => (count === 1 ? "class" : "classes"),
    specs: (count: number) => (count === 1 ? "specialization" : "specializations"),
    section: "Pick a specialization",
    specsOf: (name: string) => `${name} specializations`,
    openTalents: "talent tree",
    source: "Raidbots talent snapshot",
    note: (build: string, date: string) => `Talent trees come from the Raidbots data snapshot, build ${build}, ${date}.`,
  },
} as const;

/** Class colour tokens of app/styles/tokens.css (--c-*), used only on the class identity. */
const classColorKey: Record<string, string> = {
  deathknight: "dk", demonhunter: "dh", evoker: "evoker", mage: "mage", paladin: "pal", rogue: "rogue",
  druid: "druid", priest: "priest", hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};

/** Every playable class in the game's own order, each with its specializations and talent links. */
export function ClassCatalogPage({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const bySlug = new Map<string, typeof midnightSpecializations>();
  for (const spec of midnightSpecializations) bySlug.set(spec.classSlug, [...(bySlug.get(spec.classSlug) ?? []), spec]);
  const classes = [...bySlug.values()].sort((left, right) => left[0].classId - right[0].classId);

  return (
    <AtlasFrame lang={locale} art="/assets/wow/loading/talents-wow.webp" artPosition="center 40%">
      <AtlasHero
        align="center"
        breadcrumbs={[{ label: text.wow, href: `${prefix}/wow` }, { label: text.title }]}
        breadcrumbsLabel={text.breadcrumbs}
        title={text.title}
        lede={text.lede}
        statsLabel={text.statsLabel}
        stats={[
          { value: classes.length, label: text.classes(classes.length) },
          { value: midnightSpecializations.length, label: text.specs(midnightSpecializations.length) },
        ]}
      />

      <AtlasSection id="classes" title={text.section}>
        <ul className={styles.roster}>
          {classes.map((specs) => {
            const first = specs[0];
            const name = locale === "ru" ? first.classNameRu : first.className;
            const style = { "--class-color": `var(--c-${classColorKey[first.classKey]}, var(--atlas-accent))` } as CSSProperties;
            return (
              <li key={first.classSlug} className={styles.classRow} style={style} data-spotlight>
                <Image className={styles.classIcon} src={first.classIconUrl} alt="" width={52} height={52} />
                <div className={styles.classBody}>
                  <h3 className={styles.className}>{name}</h3>
                  <ul className={styles.specs} aria-label={text.specsOf(name)}>
                    {specs.map((spec) => (
                      <li key={spec.slug}>
                        <Link className={styles.spec} href={`${prefix}/talents/${spec.slug}`}>
                          <Image src={spec.iconUrl} alt="" width={32} height={32} />
                          <span>
                            <strong>{locale === "ru" ? spec.specNameRu : spec.specName}</strong>
                            <small>{locale === "ru" ? spec.roleRu : roleEn[spec.role]}</small>
                            <span className={styles.srOnly}> — {text.openTalents}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.note}>
          {text.note(TALENT_SNAPSHOT.build, formatAtlasDate(TALENT_SNAPSHOT.observedAt, locale))}{" "}
          <AtlasLinkButton href={TALENT_SNAPSHOT.sourceUrl} external variant="ghost" size="sm" iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}</AtlasLinkButton>
        </p>
      </AtlasSection>
    </AtlasFrame>
  );
}

const roleEn = { tank: "Tank", healer: "Healer", melee: "Melee", ranged: "Ranged", support: "Support" } as const;
