import type { CSSProperties } from "react";
import { classColors } from "@/lib/atlas/dataPalette";
import { notFound } from "next/navigation";
import { AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialLinkButton } from "@/components/wow/shared/material/MaterialButton";
import { ForeverFrame } from "@/components/wow/forever/ForeverFrame";
import { foreverTalents, talentClass } from "@/lib/forever/talents/data";
import { decodeBuild } from "@/lib/forever/talents/engine";
import { foreverCalculatorPath, foreverTalentIcon } from "@/lib/forever/talents/links";
import { ForeverCalculator } from "./ForeverCalculator";
import { talentCopy } from "./talentCopy";
import { FOREVER_KIT } from "./talentKit";
import styles from "./talents.module.css";
import { trailLabel } from "@/lib/routes/registry";

export function ForeverTalentsIndex({ lang }: { lang: "en" | "ru" }) {
  const t = talentCopy[lang];
  return <ForeverFrame lang={lang} scene="talents">
    <AtlasHero title={t.title} breadcrumbsLabel={trailLabel(lang)} breadcrumbs={[{ label: "Forever", href: `${lang === "ru" ? "/ru" : ""}/wow/forever` }]} />
    <AtlasSection title={t.classes}>
      <div className={styles.classGrid}>{foreverTalents.classes.map(cls => <MaterialLinkButton key={cls.id} kit={FOREVER_KIT} href={foreverCalculatorPath(lang, cls.slug)} fit="block">
        <span className={styles.classLink}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local client-derived class icon */}
          <img src={foreverTalentIcon(cls.iconFileId)} width={36} height={36} alt="" loading="lazy" decoding="async" />
          <strong style={{ "--class-color": classColors[cls.slug as keyof typeof classColors] } as CSSProperties}>{cls.name[lang]}</strong>
        </span>
      </MaterialLinkButton>)}</div>
    </AtlasSection>
  </ForeverFrame>;
}

export function ForeverTalentsClass({ lang, slug, token }: { lang: "en" | "ru"; slug: string; token?: string | string[] }) {
  const cls = talentClass(slug);
  if (!cls) notFound();
  const t = talentCopy[lang], parsed = decodeBuild(cls, foreverTalents.snapshot, Array.isArray(token) ? "invalid" : token);
  return <ForeverFrame lang={lang} scene="talents">
    <AtlasHero title={lang === "ru" ? `Таланты: ${cls.name[lang]}` : `${cls.name[lang]} talents`} breadcrumbsLabel={trailLabel(lang)} breadcrumbs={[
      { label: "Forever", href: `${lang === "ru" ? "/ru" : ""}/wow/forever` },
      { label: t.title, href: foreverCalculatorPath(lang) },
    ]} />
    <nav className={styles.classNav} aria-label={t.classes}>{foreverTalents.classes.map(item =>
      <a key={item.id} href={foreverCalculatorPath(lang, item.slug)} aria-current={item.id === cls.id ? "page" : undefined}>{item.name[lang]}</a>)}</nav>
    <ForeverCalculator key={cls.slug} cls={cls} snapshot={foreverTalents.snapshot} lang={lang} initial={parsed.build} initialError={parsed.error} />
  </ForeverFrame>;
}
