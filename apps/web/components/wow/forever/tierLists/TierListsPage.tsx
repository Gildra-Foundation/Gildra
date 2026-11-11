import Image from 'next/image';
import { PersonalRanking } from './PersonalRanking';
import type { CSSProperties } from 'react';
import { classColors } from '@/lib/atlas/dataPalette';
import Link from 'next/link';
import type { Metadata } from 'next';
import { AtlasHero, AtlasSection, AtlasField, AtlasSelect, AtlasEmpty } from '@/components/atlas';
import { MaterialPlaque, MaterialButton } from '@/components/wow/shared/materialAtlas';
import { ForeverFrame } from '../ForeverFrame';
import { p, type Lang } from '@/lib/i18n-paths';
import { pairedAlternates } from '@/lib/seo/metadata';
import { classIcon } from '@/lib/games/wow/assets';
import { tierData as data } from '@/lib/forever/guides/tiers';
import styles from './tierLists.module.css';
import { copy, names } from './tierListsCopy';
export function tierMetadata(lang:Lang):Metadata {return {title:copy[lang].title,description:copy[lang].lede,alternates:pairedAlternates(lang,'/wow/forever/tier-lists')};}
export function TierListsPage({lang,mode,classSlug}:{lang:Lang;mode?:string;classSlug?:string}) {
 const c=copy[lang]; const board=data.boards.find(b=>b.id===mode)??data.boards[0]; const selected=classSlug&&names[classSlug]?classSlug:'';
 const entries=board.entries.filter(e=>!selected||e.classSlug===selected);
 const base=p(lang,'/wow/forever/tier-lists');
 return <ForeverFrame lang={lang} scene="tierLists">
  <AtlasHero title={c.title} lede={c.lede} align="start" breadcrumbs={[{label:'Forever',href:p(lang,'/wow/forever')}]}/>
  <nav className={styles.modes} aria-label={c.mode}>{data.boards.map(b=><Link key={b.id} href={`${base}?mode=${b.id}${selected ? `&class=${selected}`:''}#ranking`} aria-current={b.id===board.id?'page':undefined}>{b.title[lang]}</Link>)}</nav>
  <MaterialPlaque kit="tier-lists"><form action={base+'#ranking'} className={styles.filters}>
   <input type="hidden" name="mode" value={board.id}/>
   <AtlasField label={c.class} htmlFor="tier-class"><AtlasSelect id="tier-class" name="class" defaultValue={selected}><option value="">{c.all}</option>{Object.entries(names).map(([slug,name])=><option key={slug} value={slug}>{name[lang]}</option>)}</AtlasSelect></AtlasField>
   <MaterialButton kit="tier-lists" type="submit">{c.apply}</MaterialButton>
  </form></MaterialPlaque>
  <AtlasSection id="ranking" title={board.title[lang]} description={`${board.isForecast ? c.forecast:c.opinion}. ${board.context[lang]}`}>
   {entries.length ? <MaterialPlaque kit="tier-lists"><div className={styles.rows}>{(['S','A','B','C'] as const).filter(t=>entries.some(e=>e.tier===t)).map(tier=><section key={tier} aria-label={`${tier} — ${c.tiers[tier]}`}>
    <div className={styles.row}><h3 className={styles.tier}>{tier}<span>{c.tiers[tier]}</span></h3><ul className={styles.classes}>
     {entries.filter(e=>e.tier===tier).map(e=><li key={e.classSlug} className={styles.entry} style={{'--class-color':classColors[e.classSlug as keyof typeof classColors]} as CSSProperties}>
      <h4><Image src={classIcon(names[e.classSlug].icon)!} alt="" width={40} height={40}/><Link href={p(lang,`/wow/forever/classes/${e.classSlug}`)}>{names[e.classSlug][lang]}</Link></h4>
      <p>{e.rationale[lang]}</p><Link className={styles.link} href={p(lang,`/wow/forever/talent-calc/${e.classSlug}`)}>{c.talents}</Link>
     </li>)}
    </ul></div>
   </section>)}</div></MaterialPlaque>:<AtlasEmpty title={c.empty} action={<Link className={styles.link} href={`${base}?mode=${board.id}`}>{c.reset}</Link>}/>}
  </AtlasSection>
  <PersonalRanking lang={lang} title={board.title[lang]} items={board.entries.map(e=>({id:e.classSlug,name:names[e.classSlug][lang],image:classIcon(names[e.classSlug].icon)!,note:e.rationale[lang]}))} placement={Object.fromEntries(['S','A','B','C'].map(tier=>[tier,board.entries.filter(e=>e.tier===tier).map(e=>e.classSlug)]))}/>
 </ForeverFrame>;
}
