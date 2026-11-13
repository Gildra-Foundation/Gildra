import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { AtlasBadge } from '@gildra/atlas-ui/AtlasBadge';
import { AtlasSection } from '@/components/atlas';
import { tierStyle } from '@/components/blocks/wow/tierWorkspace/tierVisuals';
import { classColors } from '@/lib/atlas/dataPalette';
import { tierData as data } from '@/lib/forever/guides/tiers';
import { foreverCalculatorPath } from '@/lib/forever/talents/links';
import { classIcon } from '@/lib/games/wow/assets';
import { p, type Lang } from '@/lib/i18n-paths';
import { pairedAlternates } from '@/lib/seo/metadata';
import { ForeverFrame } from '../ForeverFrame';
import { ForeverEmpty, ForeverHero, ForeverIcon, ForeverPanel, ForeverStack, ForeverTabs, foreverPanelStyles } from '../shared';
import { PersonalRanking } from './PersonalRanking';
import { copy, names } from './tierListsCopy';
import styles from './tierLists.module.css';

const TIERS = ['S', 'A', 'B', 'C'] as const;

export function tierMetadata(lang: Lang): Metadata { return { title: `${copy[lang].title} — WowArcana`, description: copy[lang].lede, alternates: pairedAlternates(lang, '/wow/forever/tier-lists') }; }

/** /wow/forever/tier-lists: the boards as tabs, tier rows with the letter in the tier's colour, each class with its crest and one reason. */
export function TierListsPage({ lang, mode, classSlug }: { lang: Lang; mode?: string; classSlug?: string }) {
  const c = copy[lang];
  const board = data.boards.find(b => b.id === mode) ?? data.boards[0];
  const selected = classSlug && names[classSlug] ? classSlug : '';
  const entries = board.entries.filter(e => !selected || e.classSlug === selected);
  const base = p(lang, '/wow/forever/tier-lists');
  return <ForeverFrame lang={lang} page="tierLists">
    <ForeverHero lang={lang} trail={[{ label: c.crumb }]} title={c.title} lede={c.lede} />
    <AtlasSection id="ranking">
      {/* A tab keeps the chosen class only where the other board ranks it. */}
      <ForeverTabs label={c.mode} tabs={data.boards.map(b => ({ href: `${base}?mode=${b.id}${selected && b.entries.some(e => e.classSlug === selected) ? `&class=${selected}` : ''}#ranking`, label: b.title[lang], current: b.id === board.id }))} />
      <ForeverPanel>
        <ForeverStack gap="wide">
          <div className={styles.head}>
            <p className={styles.context}>{board.context[lang]}</p>
            <span className={styles.marks}>
              {selected ? <Link className={foreverPanelStyles.link} href={`${base}?mode=${board.id}#ranking`} prefetch={false}>{c.all}</Link> : null}
              <AtlasBadge tone={board.isForecast ? 'caution' : 'neutral'}>{board.isForecast ? c.forecast : c.opinion}</AtlasBadge>
            </span>
          </div>
          {entries.length ? <div className={styles.board} data-forever-cascade="">{TIERS.filter(tier => entries.some(e => e.tier === tier)).map(tier => <section key={tier} className={styles.tierRow} style={tierStyle(tier)} aria-labelledby={`tier-${tier}`}>
            <h3 className={styles.tierBadge} id={`tier-${tier}`}><span className={styles.srOnly}>{c.tierOf(tier)}: </span><span className={styles.tierLetter} aria-hidden="true">{tier}</span><span className={styles.tierLabel}>{c.tiers[tier]}</span></h3>
            <ul className={styles.entries}>
              {entries.filter(e => e.tier === tier).map(e => <li key={e.classSlug} className={styles.entry} style={{ '--class-color': classColors[e.classSlug as keyof typeof classColors] } as CSSProperties}>
                <ForeverIcon src={classIcon(names[e.classSlug].icon)!} size={52} />
                <div className={styles.entryText}>
                  <h4><Link href={p(lang, `/wow/forever/classes/${e.classSlug}`)} prefetch={false}>{names[e.classSlug][lang]}</Link></h4>
                  <p>{e.rationale[lang]}</p>
                </div>
                <Link className={styles.talents} href={foreverCalculatorPath(lang, e.classSlug)} prefetch={false} aria-label={c.talentsOf(names[e.classSlug][lang])} title={c.talents}><Sparkles aria-hidden="true" /></Link>
              </li>)}
            </ul>
          </section>)}</div> : <ForeverEmpty lang={lang} reset={`${base}?mode=${board.id}#ranking`} />}
        </ForeverStack>
      </ForeverPanel>
    </AtlasSection>
    <AtlasSection id="mine" title={c.personal}>
      <PersonalRanking lang={lang} title={board.title[lang]} items={board.entries.map(e => ({ id: e.classSlug, name: names[e.classSlug][lang], image: classIcon(names[e.classSlug].icon)!, note: e.rationale[lang] }))} placement={Object.fromEntries(TIERS.map(tier => [tier, board.entries.filter(e => e.tier === tier).map(e => e.classSlug)]))} />
    </AtlasSection>
  </ForeverFrame>;
}
