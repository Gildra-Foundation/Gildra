import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT as KIT } from "@/lib/wow/charactersKit";
import { midnightSpecializations } from "@/lib/data/wow";
import styles from "./classCatalog.module.css";
import { trail } from "@/lib/routes/registry";
import type { Lang as Locale } from "@/lib/i18n-paths";

const copy = {
  ru: {
    breadcrumbs: "Навигация",
    title: "Классы и специализации",
    specsOf: (name: string) => `Специализации: ${name}`,
  },
  en: {
    breadcrumbs: "Breadcrumbs",
    title: "Classes and specializations",
    specsOf: (name: string) => `${name} specializations`,
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
        title={text.title}
      />

      <AtlasSection id="classes">
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
      </AtlasSection>
    </AtlasFrame>
  );
}

const roleEn = { tank: "Tank", healer: "Healer", melee: "Melee", ranged: "Ranged", support: "Support" } as const;
