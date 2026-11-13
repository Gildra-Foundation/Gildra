import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, GitCompareArrows, Sparkles } from 'lucide-react';
import { AtlasSection } from '@/components/atlas';
import { MaterialLinkButton } from '@/components/wow/shared/materialAtlas';
import { pageGlyphs, realmGlyphs } from '@/components/platform/navigation/SiteGlyphs';
import { foreverRealms } from '@/components/platform/navigation/navigationMap';
import { classColors } from '@/lib/atlas/dataPalette';
import { classChangeIconUrl, classHighlights, classesSnapshot as snapshot, foreverClasses, type ClassChange, type ChangeQuery, type ForeverClass } from '@/lib/data/wow/foreverClasses';
import { foreverCalculatorPath } from '@/lib/forever/talents/links';
import { classIcon } from '@/lib/games/wow/assets';
import { p, type Lang } from '@/lib/i18n-paths';
import { ForeverFrame } from '../ForeverFrame';
import { FOREVER_KIT, ForeverArtCard, ForeverArtGrid, ForeverChips, ForeverCrest, ForeverCrests, ForeverHero, ForeverIcon, ForeverPanel, ForeverRow, ForeverRows, ForeverStack, foreverPanelStyles } from '../shared';
import { ClassChanges } from './ClassChanges';
import { ClassRoleFilter } from './ClassRoleFilter';
import { ComparisonCredit, RoleBadges, rolesOf, treesOf } from './classParts';
import { classesCopy } from './classesCopy';
import styles from './classes.module.css';

const rows = snapshot.records as ClassChange[];
const classTone = (c: ForeverClass) => ({ '--class-color': classColors[c.slug] }) as CSSProperties;
const menuLink = (href: string) => foreverRealms.flatMap(realm => realm.groups.flatMap(group => group.links)).find(link => link.href === href)!;
/** Where a class leads next: the names and one-line notes are the menu's. */
const tools = [
  { link: menuLink('/wow/forever/talent-calc'), Sign: realmGlyphs['forever-talent-calc'] },
  { link: menuLink('/wow/forever/changes'), Sign: pageGlyphs.guide },
  { link: menuLink('/wow/forever/tier-lists'), Sign: pageGlyphs.meta },
];

/** /wow/forever/classes: every class on a plaque of its own — its trees with their roles, the ways to its page, talents and changes. */
export function ForeverClassesPage({ lang }: { lang: Lang }) {
  const t = classesCopy[lang];
  return <ForeverFrame lang={lang} page="classes">
    <ForeverHero lang={lang} trail={[{ label: t.classes }]} title={t.classes} lede={t.classLede}
      actions={<ClassRoleFilter target="forever-roster" label={t.roleFilter} labels={t.filters} />} />
    <AtlasSection id="classes">
      <ForeverStack gap="wide">
        <ul className={styles.roster} id="forever-roster" data-role-filter="all" data-forever-cascade="">
          {foreverClasses.map(c => {
            const page = p(lang, `/wow/forever/classes/${c.slug}`);
            return <ForeverPanel as="li" key={c.slug} className={styles.classCard} style={classTone(c)} aria-labelledby={`${c.slug}-name`}>
              <Link className={styles.classHead} href={page} prefetch={false}>
                <ForeverIcon src={classIcon(c.icon)!} size={56} />
                <h2 id={`${c.slug}-name`} className={styles.className}>{c.name[lang]}</h2>
                <ArrowRight className={styles.classArrow} aria-hidden="true" />
              </Link>
              <ul className={styles.treeRows} aria-label={t.treesOf(c.name[lang])}>
                {treesOf(c.slug, lang).map(tree => <li key={tree.id} data-roles={tree.roles.join(' ')}>
                  <Link className={styles.treeRow} href={tree.href} prefetch={false}>
                    <Image src={tree.icon} alt="" width={36} height={36} unoptimized />
                    <strong>{tree.name}</strong>
                    <RoleBadges roles={tree.roles} lang={lang} />
                  </Link>
                </li>)}
              </ul>
              <ul className={styles.classLinks}>
                <li><Link className={foreverPanelStyles.link} href={foreverCalculatorPath(lang, c.slug)} prefetch={false}><Sparkles aria-hidden="true" />{t.talents}</Link></li>
                <li><Link className={foreverPanelStyles.link} href={`${page}#changes`} prefetch={false}><GitCompareArrows aria-hidden="true" />{t.classChanges}</Link></li>
              </ul>
            </ForeverPanel>;
          })}
        </ul>
        <ForeverRows label={t.tools}>
          {tools.map(({ link, Sign }) => <ForeverRow key={link.href} href={p(lang, link.href)} sign={<Sign />} title={link.label[lang]} note={link.note?.[lang]} />)}
        </ForeverRows>
      </ForeverStack>
    </AtlasSection>
  </ForeverFrame>;
}

/** /wow/forever/classes/<class>: the three trees, what the class does differently in combat, its changes from Classic. */
export function ForeverClassPage({ lang, c, query }: { lang: Lang; c: ForeverClass; query: ChangeQuery }) {
  const t = classesCopy[lang];
  const page = p(lang, `/wow/forever/classes/${c.slug}`);
  return <ForeverFrame lang={lang} page="classes">
    <div style={classTone(c)}>
      <ForeverHero lang={lang} className={styles.classHero} trail={[{ label: t.classes, href: p(lang, '/wow/forever/classes') }, { label: c.name[lang] }]}
        eyebrow={rolesOf(c.slug).map(role => t.roles[role]).join(' · ')}
        crest={<Image src={classIcon(c.icon)!} alt="" width={64} height={64} priority />}
        title={c.name[lang]} lede={c.description[lang]}
        actions={<MaterialLinkButton kit={FOREVER_KIT} fit="stack" href={foreverCalculatorPath(lang, c.slug)}>{t.calculator}</MaterialLinkButton>} />
    </div>
    <AtlasSection id="talents" title={t.talents}>
      <ForeverArtGrid className={styles.treeGrid} label={t.treesOf(c.name[lang])} min={260} fit>
        {treesOf(c.slug, lang).map(tree => <ForeverArtCard key={tree.id} href={tree.href} art={tree.art} ratio="16 / 9" accent={classColors[c.slug]}
          sizes="(max-width: 700px) 92vw, (max-width: 1200px) 33vw, 460px"
          icon={tree.icon} title={tree.name} note={<RoleBadges roles={tree.roles} lang={lang} />} />)}
      </ForeverArtGrid>
    </AtlasSection>
    <AtlasSection id="combat" title={t.highlights}>
      <ForeverPanel>
        <ul className={styles.highlights}>{classHighlights[c.slug].map(h => {
          const change = rows.find(row => row.classSlug === c.slug && row.kind === 'talent' && row.name.en === h.talent);
          const icon = classChangeIconUrl(change?.icon);
          return <li key={h.talent} data-icon={icon ? '' : undefined}>
            {icon ? <ForeverIcon src={icon} size={48} /> : null}
            <div>
              <h3><a href={`${page}?q=${encodeURIComponent(h.talent)}#changes`}>{change?.name[lang] ?? h.talent}</a></h3>
              <p>{h.text[lang]}</p>
            </div>
          </li>;
        })}</ul>
      </ForeverPanel>
    </AtlasSection>
    <AtlasSection id="changes" title={t.classChanges}>
      <ForeverStack>
        <ClassChanges lang={lang} classSlug={c.slug} query={query} action={`/wow/forever/classes/${c.slug}`} />
        <ComparisonCredit lang={lang} />
      </ForeverStack>
    </AtlasSection>
    <AtlasSection id="classes" title={t.classes}>
      <ForeverCrests label={t.classes} count={foreverClasses.length}>
        {foreverClasses.map(entry => <ForeverCrest key={entry.slug} href={p(lang, `/wow/forever/classes/${entry.slug}`)} icon={classIcon(entry.icon)!} label={entry.name[lang]} color={classColors[entry.slug]} current={entry.slug === c.slug} />)}
      </ForeverCrests>
    </AtlasSection>
  </ForeverFrame>;
}

/** /wow/forever/changes: the same list for any class — the class is picked with its crest. */
export function ForeverChangesPage({ lang, c, query }: { lang: Lang; c: ForeverClass; query: ChangeQuery }) {
  const t = classesCopy[lang];
  const base = p(lang, '/wow/forever/changes');
  return <ForeverFrame lang={lang} page="changes">
    <ForeverHero lang={lang} trail={[{ label: t.changes }]} title={t.changes} lede={t.lede} />
    <AtlasSection id="changes">
      <ForeverStack>
        <div className={styles.picker}>
          <ForeverChips label={t.class} chips={foreverClasses.map(entry => ({ href: `${base}?class=${entry.slug}#changes`, label: entry.name[lang], icon: classIcon(entry.icon)!, active: entry.slug === c.slug }))} />
          <Link className={foreverPanelStyles.link} href={p(lang, `/wow/forever/classes/${c.slug}`)} prefetch={false}>{t.aboutClass(c.name[lang])}<ArrowRight aria-hidden="true" /></Link>
        </div>
        <ClassChanges lang={lang} classSlug={c.slug} query={query} action="/wow/forever/changes" chooseClass />
        <ComparisonCredit lang={lang} />
      </ForeverStack>
    </AtlasSection>
  </ForeverFrame>;
}
