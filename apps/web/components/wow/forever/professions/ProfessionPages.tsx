import Link from 'next/link';
import { foreverItemPath } from '@/lib/forever/guides/links';
import Image from 'next/image';
import { FOREVER_KIT, professionIcon } from './kit';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AtlasHero, AtlasSection, AtlasField, AtlasInput, AtlasSelect, AtlasTable, AtlasEmpty, AtlasCheckbox, AtlasBadge } from '@/components/atlas';
import { MaterialPlaque, MaterialButton, materialStyles, materialIconFrameStyle } from '@/components/wow/shared/materialAtlas';
import { ForeverFrame } from '../ForeverFrame';
import { professions, professionBySlug, filterRecipes, pageNumber, type RecipeFilters, type Profession, type Recipe } from '@/lib/forever/guides/professions';
import { p, type Lang } from '@/lib/i18n-paths';
import { pairedAlternates } from '@/lib/seo/metadata';
import { copy, summaries, specializations } from './copy';
import { RecipeMaterials } from './RecipeMaterials';
import styles from './professions.module.css';
const root = '/wow/forever/professions';
const path = (lang: Lang, slug = '') => p(lang, `${root}${slug ? `/${slug}` : ''}`);
const record = (lang: Lang, id: number) => foreverItemPath(id, lang);
const crumbs = (lang: Lang, profession?: Profession) => [{ label: 'Forever', href: p(lang, '/wow/forever') }, { label: copy[lang].title, href: path(lang) }, ...(profession ? [{ label: profession.name[lang], href: path(lang, profession.slug) }] : [])];
export function professionMetadata(lang: Lang, slug?: string, recipeId?: string): Metadata {
  const prof = slug ? professionBySlug(slug) : null;
  const recipe = recipeId && prof ? prof.recipes.find(r => String(r.id) === recipeId) : null;
  const title = recipe ? `${recipe.name[lang]} — ${prof!.name[lang]} · Forever` : prof ? `${prof.name[lang]} · Forever` : copy[lang].title;
  return { title, description: prof ? summaries[prof.slug][lang] : copy[lang].lede, alternates: pairedAlternates(lang, `${root}${slug ? `/${slug}` : ''}${recipeId ? `/${recipeId}` : ''}`) };
}
export function ProfessionsHome({ lang }: { lang: Lang }) {
 const c = copy[lang];
 return <ForeverFrame lang={lang} scene="foreverCrafts"><AtlasHero title={c.title} lede={c.lede} align="start" breadcrumbs={crumbs(lang).slice(0,1)} />
  {(['crafting','gathering','secondary'] as const).map(kind => <AtlasSection key={kind} title={c.kinds[kind]}>
   <div className={styles.grid}>{professions.filter(pr => pr.kind===kind).map(pr => <MaterialPlaque kit={FOREVER_KIT} key={pr.slug} as="article" className={styles.card}>
    <div className={styles.cardHead}><span className={materialStyles.iconFrame} style={materialIconFrameStyle(FOREVER_KIT,52)}><Image src={professionIcon(pr.icon)} alt="" width={52} height={52} unoptimized/></span><h3><Link className={styles.link} href={path(lang, pr.slug)}>{pr.name[lang]}</Link></h3></div><p>{summaries[pr.slug][lang]}</p><p>1–{pr.maxSkill}</p>
   </MaterialPlaque>)}</div>
  </AtlasSection>)}
 </ForeverFrame>;
}
function RecipeSource({ recipe, profession, lang }: { recipe: Recipe; profession: Profession; lang: Lang }) {
 const c=copy[lang];
 return <>{!recipe.auto && !recipe.trainers.length && !recipe.sourceItems.length ? '—' : null}{recipe.auto ? c.automatic : recipe.trainers.length ? c.trainer : null}{recipe.sourceItems.map(id => <Link key={id} className={styles.link} href={record(lang,id)}>{profession.items[id].name[lang]}</Link>)}</>;
}
export function ProfessionPage({ lang, slug, filters }: { lang: Lang; slug: string; filters: RecipeFilters }) {
 const prof=professionBySlug(slug); if (!prof) notFound(); const c=copy[lang];
 const found=filterRecipes(prof,filters); const page=pageNumber(filters.page, found.length); const size=50; const recipes=found.slice((page-1)*size,page*size);
 const pageHref=(n:number) => { const q=new URLSearchParams(); for(const key of ['q','source','skill','camp','fresh'] as const) if(filters[key]) q.set(key,filters[key]!); q.set('page',String(n));return `${path(lang,slug)}?${q}#recipes`; };
 return <ForeverFrame lang={lang} scene="foreverCrafts"><AtlasHero align="start" title={prof.name[lang]} lede={summaries[slug][lang]} breadcrumbs={crumbs(lang)} />
 <AtlasSection id="recipes" title={c.recipes}><MaterialPlaque kit={FOREVER_KIT}>
  <form action={path(lang,slug)+'#recipes'} className={styles.filters}>
   <AtlasField label={c.search} htmlFor="recipe-search"><AtlasInput id="recipe-search" name="q" defaultValue={filters.q??''} type="search" maxLength={120} /></AtlasField>
   <AtlasField label={c.skill} htmlFor="recipe-skill"><AtlasInput id="recipe-skill" name="skill" type="number" min={1} max={300} defaultValue={filters.skill??''} /></AtlasField>
   <AtlasField label={c.source} htmlFor="recipe-source"><AtlasSelect id="recipe-source" name="source" defaultValue={filters.source??'all'}><option value="all">{c.all}</option><option value="trainer">{c.trainer}</option><option value="recipe">{c.recipe}</option><option value="automatic">{c.automatic}</option></AtlasSelect></AtlasField>
   <AtlasField label={c.camp} htmlFor="recipe-camp"><AtlasSelect id="recipe-camp" name="camp" defaultValue={filters.camp??'all'}><option value="all">{c.any}</option><option value="yes">{c.onlyCamp}</option></AtlasSelect></AtlasField>
   <AtlasCheckbox name="fresh" value="yes" defaultChecked={filters.fresh==='yes'} label={c.fresh}/><div className={styles.actions}><MaterialButton kit={FOREVER_KIT} type="submit">{c.apply}</MaterialButton><Link className={styles.link} href={path(lang,slug)+'#recipes'}>{c.reset}</Link></div>
  </form>
  {recipes.length ? <AtlasTable label={c.recipes} layout="cards" rows={recipes} rowKey={r=>String(r.id)} columns={[
   {key:'name',header:c.recipes,rowHeader:true,cell:r=><Link className={styles.link} href={path(lang,`${slug}/${r.id}`)}><Image src={professionIcon(r.icon)} alt="" width={32} height={32} unoptimized/>{r.name[lang]}{r.new && <AtlasBadge tone="info">{c.fresh}</AtlasBadge>}</Link>},
   {key:'skill',header:c.required,numeric:true,cell:r=><span>{r.requiredSkill??'—'}{r.yellow!==null && r.grey!==null && <span className={styles.thresholds}>{c.yellow}: {r.yellow} · {c.grey}: {r.grey}</span>}</span>},
   {key:'source',header:c.source,cell:r=><RecipeSource recipe={r} profession={prof} lang={lang}/>},
   {key:'materials',header:c.materials,cell:r=><div className={styles.materials}>{r.reagents.map(x=><span key={x.id}>{x.quantity} × <Link className={styles.link} href={record(lang,x.id)}>{prof.items[x.id].name[lang]}</Link></span>)}</div>},
  ]}/> : <AtlasEmpty title={c.empty} action={<Link className={styles.link} href={path(lang,slug)}>{c.reset}</Link>}/>}
  {found.length>size && <nav className={styles.pager} aria-label={c.recipes}>{page>1 ? <Link className={styles.link} href={pageHref(page-1)}>{c.previous}</Link>:<span/>}<span>{page} / {Math.ceil(found.length/size)}</span>{page*size<found.length ? <Link className={styles.link} href={pageHref(page+1)}>{c.next}</Link>:<span/>}</nav>}
 </MaterialPlaque></AtlasSection>
 <AtlasSection title={c.ranks}><MaterialPlaque kit={FOREVER_KIT}><dl className={styles.facts}>{prof.ranks.map((rank,i)=><div key={rank.name}><dt>{c.rankNames[rank.name as keyof typeof c.rankNames]}</dt><dd>{i ? prof.ranks[i-1].maxSkill : 1}–{rank.maxSkill}</dd></div>)}</dl></MaterialPlaque></AtlasSection>
 {specializations[slug] && <AtlasSection title={c.specializations}><MaterialPlaque kit={FOREVER_KIT}><p className={styles.text}>{specializations[slug][lang]}</p></MaterialPlaque></AtlasSection>}
 {prof.trainers.length>0 && <AtlasSection title={c.trainers}><MaterialPlaque kit={FOREVER_KIT}><AtlasTable label={c.trainers} layout="cards" rows={prof.trainers} rowKey={t=>String(t.id)} columns={[
  {key:'name',header:c.name,rowHeader:true,cell:t=>t.name}, {key:'faction',header:c.faction,cell:t=>t.faction==='Alliance'?c.alliance:t.faction==='Horde'?c.horde:c.neutral},
  {key:'zone',header:c.zone,cell:t=>t.zone ? `${t.zone}${t.x!==null && t.y!==null ? ` · ${t.x}, ${t.y}`:''}`:'—'},
 ]}/></MaterialPlaque></AtlasSection>}
 </ForeverFrame>;
}
export function RecipePage({lang,slug,recipeId}:{lang:Lang;slug:string;recipeId:string}) {
 const prof=professionBySlug(slug);const recipe=prof?.recipes.find(r=>String(r.id)===recipeId);if(!prof||!recipe)notFound();const c=copy[lang];
 const output=recipe.output;
 return <ForeverFrame lang={lang} scene="foreverCrafts"><AtlasHero title={recipe.name[lang]} align="start" breadcrumbs={crumbs(lang,prof)} />
 <AtlasSection title={c.materials}><MaterialPlaque kit={FOREVER_KIT}>
  <dl className={styles.facts}>
   {output && <div><dt>{c.output}</dt><dd>{output.quantityRange ? output.quantityRange.join('–'):output.quantity} × <Link className={styles.link} href={record(lang,output.id)}>{prof.items[output.id].name[lang]}</Link></dd></div>}
   {recipe.requiredSkill!==null && <div><dt>{c.required}</dt><dd>{recipe.requiredSkill}</dd></div>}
   {recipe.yellow!==null && <div><dt>{c.yellow}</dt><dd>{recipe.yellow}</dd></div>}
   {recipe.grey!==null && <div><dt>{c.grey}</dt><dd>{recipe.grey}</dd></div>}
  </dl>
  <RecipeMaterials recipe={recipe} items={Object.fromEntries(recipe.reagents.map(r=>[String(r.id),prof.items[r.id]]))} lang={lang}/>
  {(recipe.tools.length>0 || recipe.station) && <dl className={styles.facts}>{recipe.tools.length>0 && <div><dt>{c.tools}</dt><dd>{recipe.tools.join(', ')}</dd></div>}{recipe.station && <div><dt>{c.station}</dt><dd>{recipe.station}</dd></div>}</dl>}
 </MaterialPlaque></AtlasSection>
 {(recipe.auto || recipe.trainers.length>0 || recipe.sourceItems.length>0) && <AtlasSection title={c.acquisition}><MaterialPlaque kit={FOREVER_KIT}><RecipeSource recipe={recipe} profession={prof} lang={lang}/>{recipe.trainers.length>0 && <ul className={styles.list}>{recipe.trainers.map(name=><li key={name}>{name}</li>)}</ul>}</MaterialPlaque></AtlasSection>}
 </ForeverFrame>;
}
