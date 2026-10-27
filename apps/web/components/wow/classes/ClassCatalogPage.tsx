import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { pluralRu } from "@gildra/atlas-ui/format";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT } from "@/lib/wow/charactersKit";
import { midnightSpecializations, TALENT_SNAPSHOT } from "@/lib/data/wow";
import styles from "./classCatalog.module.css";
import { trail } from "@/lib/routes/registry";
import type { Lang as Locale } from "@/lib/i18n-paths";

const copy = {
  ru: {
    breadcrumbs: "Навигация",
    eyebrow: "Midnight · Сезон 2",
    title: "Классы и специализации",
    lede: "Все классы Midnight. Выберите специализацию, чтобы открыть её дерево талантов.",
    statsLabel: "Классы и специализации",
    classes: (count: number) => pluralRu(count, "класс", "класса", "классов"),
    specs: (count: number) => pluralRu(count, "специализация", "специализации", "специализаций"),
    section: "Выберите специализацию",
    specsOf: (name: string) => `Специализации: ${name}`,
    source: "Деревья талантов — Raidbots",
  },
  en: {
    breadcrumbs: "Breadcrumbs",
    eyebrow: "Midnight · Season 2",
    title: "Classes and specializations",
    lede: "Every Midnight class. Pick a specialization to open its talent tree.",
    statsLabel: "Classes and specializations",
    classes: (count: number) => (count === 1 ? "class" : "classes"),
    specs: (count: number) => (count === 1 ? "specialization" : "specializations"),
    section: "Pick a specialization",
    specsOf: (name: string) => `${name} specializations`,
    source: "Talent trees from Raidbots",
  },
} as const;

/** Class colour tokens of app/styles/tokens.css (--c-*), used only on the class identity. */
const classColorKey: Record<string, string> = {
  deathknight: "dk", demonhunter: "dh", evoker: "evoker", mage: "mage", paladin: "pal", rogue: "rogue",
  druid: "druid", priest: "priest", hunter: "hunter", shaman: "shaman", warlock: "lock", monk: "monk", warrior: "war",
};

/** Every playable class in the game's own order, each on a painted plaque with its specializations. */
export function ClassCatalogPage({ locale }: { locale: Locale }) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const bySlug = new Map<string, typeof midnightSpecializations>();
  for (const spec of midnightSpecializations) bySlug.set(spec.classSlug, [...(bySlug.get(spec.classSlug) ?? []), spec]);
  const classes = [...bySlug.values()].sort((left, right) => left[0].classId - right[0].classId);

  return (
    <AtlasFrame lang={locale} scene="classes">
      <AtlasHero
        breadcrumbs={trail(locale, "classes")}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={text.eyebrow}
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
              <MaterialPlaque as="li" kit={KIT} key={first.classSlug} id={first.classSlug} className={styles.classCard} style={style} aria-labelledby={`${first.classSlug}-name`}>
                <div className={styles.classHead}>
                  <span className={materialStyles.iconFrame} style={materialIconFrameStyle(KIT, 56)}>
                    <Image src={first.classIconUrl} alt="" width={56} height={56} />
                  </span>
                  <h3 id={`${first.classSlug}-name`} className={styles.className}>{name}</h3>
                </div>
                <ul className={styles.specs} aria-label={text.specsOf(name)}>
                  {specs.map((spec) => (
                    <li key={spec.slug}>
                      <Link className={styles.spec} href={`${prefix}/talents/${spec.slug}`}>
                        <Image src={spec.iconUrl} alt="" width={32} height={32} />
                        <span>
                          <strong>{locale === "ru" ? spec.specNameRu : spec.specName}</strong>
                          <small>{locale === "ru" ? spec.roleRu : roleEn[spec.role]}</small>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </MaterialPlaque>
            );
          })}
        </ul>
        <p className={styles.note}>
          <a href={TALENT_SNAPSHOT.sourceUrl} target="_blank" rel="noopener noreferrer">
            {text.source}<ArrowUpRight aria-hidden="true" />
          </a>
        </p>
      </AtlasSection>
    </AtlasFrame>
  );
}

const roleEn = { tank: "Tank", healer: "Healer", melee: "Melee", ranged: "Ranged", support: "Support" } as const;
