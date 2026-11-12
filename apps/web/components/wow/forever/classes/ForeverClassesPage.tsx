import { FOREVER_KIT } from './classesKit';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { classColors } from '@/lib/atlas/dataPalette';
import { classTrees as trees } from '@/lib/data/wow/foreverClasses';
import { AtlasHero, AtlasSection, AtlasAnchorNav } from '@/components/atlas';
import { MaterialPlaque, MaterialLinkButton, materialStyles, materialIconFrameStyle } from '@/components/wow/shared/materialAtlas';
import { ForeverFrame } from '../ForeverFrame';
import { classIcon } from '@/lib/games/wow/assets';
import { p, type Lang } from '@/lib/i18n-paths';
import { foreverClasses, type ForeverClass } from '@/lib/data/wow/foreverClasses';
import { classHighlights } from '@/lib/data/wow/foreverClasses';
import type { ClassChange, ChangeQuery } from '@/lib/data/wow/foreverClasses';
import { classesSnapshot as snapshot } from '@/lib/data/wow/foreverClasses';
import { ClassChanges } from './ClassChanges';
import { classesCopy } from './classesCopy';
import styles from './classes.module.css';
import { trailLabel } from "@/lib/routes/registry";

function ClassIdentity({ c, lang }: { c: ForeverClass; lang: Lang }) {
  const icon = classIcon(c.icon);
  return <span className={styles.classHead}>{icon ? <span className={materialStyles.iconFrame} style={materialIconFrameStyle(FOREVER_KIT, 64)}><Image src={icon} alt="" width={64} height={64} /></span> : null}<span className={styles.className} style={{ "--class-color": classColors[c.slug] } as CSSProperties}>{c.name[lang]}{lang === 'ru' ? <span className={styles.alias} lang="en">{c.name.en}</span> : null}</span></span>;
}
/** Legal attribution required by the comparison dataset, replaced with a shared legal credit at integration. */
function ComparisonCredit({ lang }: { lang: Lang }) {
  return <details className={styles.credit}><summary>{classesCopy[lang].sources}</summary><p><a href="https://talentsforever.com">Talents Forever</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · {classesCopy[lang].adapted}</p></details>;
}
export function ForeverClassesPage({ lang }: { lang: Lang }) {
  const t = classesCopy[lang];
  return <ForeverFrame lang={lang}>
    <AtlasHero title={t.classes} lede={t.classLede} breadcrumbsLabel={trailLabel(lang)} breadcrumbs={[{ label: 'Forever', href: p(lang, '/wow/forever') }]} actions={<MaterialLinkButton kit={FOREVER_KIT} href={p(lang, '/wow/forever/changes')}>{t.changes}</MaterialLinkButton>} />
    <div className={styles.grid}>{foreverClasses.map(c => <MaterialPlaque key={c.slug} kit={FOREVER_KIT} as="article">
      <h2 className={materialStyles.title}><a href={p(lang, `/wow/forever/classes/${c.slug}`)}><ClassIdentity c={c} lang={lang} /></a></h2>
      <p className={materialStyles.text}>{trees[c.slug].map(tree => tree.name[lang]).join("\u00A0· ")}</p>
      <div className={styles.actions}><a className={styles.classLink} href={p(lang, `/wow/forever/talent-calc/${c.slug}`)}>{t.talents}</a><a className={styles.classLink} href={`${p(lang, `/wow/forever/classes/${c.slug}`)}#changes`}>{t.changes}</a></div>
    </MaterialPlaque>)}</div>
  </ForeverFrame>;
}
export function ForeverClassPage({ lang, c, query }: { lang: Lang; c: ForeverClass; query: ChangeQuery }) {
  const t = classesCopy[lang];
  const rows = snapshot.records as ClassChange[];
  return <ForeverFrame lang={lang}>
    <AtlasHero title={c.name[lang]} lede={c.description[lang]} breadcrumbsLabel={trailLabel(lang)} breadcrumbs={[{ label: 'Forever', href: p(lang, '/wow/forever') }, { label: t.classes, href: p(lang, '/wow/forever/classes') }]} actions={<MaterialLinkButton kit={FOREVER_KIT} href={p(lang, `/wow/forever/talent-calc/${c.slug}`)}>{t.calculator}</MaterialLinkButton>} />
    <AtlasSection title={t.talents}><div className={styles.grid}>{trees[c.slug].map(tree => <a className={styles.tree} key={tree.id} href={`${p(lang, `/wow/forever/talent-calc/${c.slug}`)}#tree-${tree.slug}`}>{tree.name[lang]}</a>)}</div></AtlasSection>
    <AtlasSection title={t.highlights}><MaterialPlaque kit={FOREVER_KIT}><div className={styles.highlights}>{classHighlights[c.slug].map(h => {
      const change = rows.find(r => r.classSlug === c.slug && r.kind === 'talent' && r.name.en === h.talent);
      return <div key={h.talent}><h3 className={materialStyles.title}><a href={`${p(lang, `/wow/forever/classes/${c.slug}`)}?q=${encodeURIComponent(h.talent)}#changes`}>{change?.name[lang] ?? h.talent}</a></h3><p>{h.text[lang]}</p></div>;
    })}</div></MaterialPlaque></AtlasSection>
    <AtlasSection id="changes" title={t.changes}><ClassChanges lang={lang} classSlug={c.slug} query={query} action={`/wow/forever/classes/${c.slug}`} /></AtlasSection>
    <ComparisonCredit lang={lang} />
  </ForeverFrame>;
}
export function ForeverChangesPage({ lang, c, query }: { lang: Lang; c: ForeverClass; query: ChangeQuery }) {
  const t = classesCopy[lang];
  return <ForeverFrame lang={lang}>
    <AtlasHero title={t.changes} lede={t.lede} breadcrumbsLabel={trailLabel(lang)} breadcrumbs={[{ label: 'Forever', href: p(lang, '/wow/forever') }]} actions={<MaterialLinkButton kit={FOREVER_KIT} href={p(lang, `/wow/forever/classes/${c.slug}`)}>{c.name[lang]}</MaterialLinkButton>} />
    <AtlasAnchorNav label={t.classes} items={foreverClasses.map(item => ({ href: `${p(lang, "/wow/forever/changes")}?class=${item.slug}#changes`, label: item.name[lang] }))} />
    <div id="changes"><ClassChanges lang={lang} classSlug={c.slug} query={query} action="/wow/forever/changes" chooseClass /></div>
    <ComparisonCredit lang={lang} />
  </ForeverFrame>;
}
