import Link from "next/link";
import type { CSSProperties } from "react";
import { AtlasFrame, AtlasHero, AtlasSection, AtlasShareButton } from "@/components/atlas";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import { p, type Lang } from "@/lib/i18n-paths";
import { mistsClasses } from "@/lib/wow/mists/data";
import type { MistsBuild, MistsClass } from "@/lib/wow/mists/types";
import { MistsCalculator, type CalculatorClass } from "./MistsCalculator";
import { mistsCopy } from "./mistsCopy";
import styles from "./mists.module.css";

/** The class picker of the calculator: every class icon, the current one marked. */
function ClassPicker({ lang, current }: { lang: Lang; current?: string }) {
  const t = mistsCopy[lang];
  return <nav className={styles.classPicker} aria-label={t.classes}>
    {mistsClasses.map(cls => <Link key={cls.slug} href={p(lang, `/wow/mists/talents/${cls.slug}`)} prefetch={false}
      className={styles.classPick} style={{ "--class-color": cls.color } as CSSProperties}
      aria-current={cls.slug === current ? "page" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
      <img src={cls.icon} alt="" width={36} height={36} decoding="async" />
      <span>{cls.name[lang]}</span>
    </Link>)}
  </nav>;
}

const crumbs = (lang: Lang) => [{ label: mistsCopy[lang].title, href: p(lang, "/wow/mists") }];

/** /wow/mists/talents: choose a class. */
export function MistsTalentIndex({ lang }: { lang: Lang }) {
  const t = mistsCopy[lang];
  return <AtlasFrame lang={lang} scene="classes">
    <AtlasHero title={t.calculator} breadcrumbsLabel={t.breadcrumbs} breadcrumbs={[...crumbs(lang), { label: t.talents }]} />
    <AtlasSection><ClassPicker lang={lang} /></AtlasSection>
  </AtlasFrame>;
}

/** Only what the calculator shows, in the page's language. */
function forCalculator(cls: MistsClass, lang: Lang): CalculatorClass {
  return {
    slug: cls.slug,
    color: cls.color,
    specs: cls.specs.map(spec => ({ slug: spec.slug, name: spec.name[lang], icon: spec.icon })),
    tiers: cls.tiers.map(tier => ({
      level: tier.level,
      talents: tier.talents.map(talent => ({
        name: talent.name[lang],
        icon: talent.icon,
        meta: [talent.cost, talent.range, talent.castTime, talent.cooldown].flatMap(line => line ? [line[lang]] : []),
        description: talent.description[lang],
      })),
    })),
  };
}

/** /wow/mists/talents/<class>: the calculator, the build in the address. */
export function MistsClassTalentsPage({ lang, cls, build }: { lang: Lang; cls: MistsClass; build: MistsBuild }) {
  const t = mistsCopy[lang];
  const title = t.classTalents(cls.name[lang]);
  return <AtlasFrame lang={lang} scene="classes">
    <AtlasHero title={title} breadcrumbsLabel={t.breadcrumbs}
      breadcrumbs={[...crumbs(lang), { label: t.talents, href: p(lang, "/wow/mists/talents") }, { label: cls.name[lang] }]}
      toolbar={<AtlasShareButton title={`${title} — ${t.title}`} locale={lang} />} />
    <AtlasSection>
      <ClassPicker lang={lang} current={cls.slug} />
      <MaterialPlaque kit={TALENTS_KIT} className={styles.plaque}>
        <MistsCalculator cls={forCalculator(cls, lang)} initial={build}
          copy={{ spec: t.spec, level: t.level, tiers: t.tiers, reset: t.reset }} />
      </MaterialPlaque>
    </AtlasSection>
  </AtlasFrame>;
}
