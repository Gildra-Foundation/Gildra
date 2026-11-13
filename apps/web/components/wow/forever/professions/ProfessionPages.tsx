import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AtlasCheckbox, AtlasSection } from '@/components/atlas';
import { itemQualityColors } from '@/lib/atlas/dataPalette';
import { foreverItemPath } from '@/lib/forever/guides/links';
import { professions, professionBySlug, filterRecipes, pageNumber, type RecipeFilters, type Profession, type Recipe } from '@/lib/forever/guides/professions';
import { p, type Lang } from '@/lib/i18n-paths';
import { pairedAlternates } from '@/lib/seo/metadata';
import { ForeverFrame } from '../ForeverFrame';
import { ForeverEmpty, ForeverFilters, ForeverHero, ForeverIcon, ForeverLevel, ForeverList, ForeverListRow, ForeverPager, ForeverPanel, ForeverSearch, ForeverSelect, ForeverStack, foreverPanelStyles, sharedCopy } from '../shared';
import { copy, summaries, specializations } from './copy';
import { professionIcon } from './kit';
import { RecipeMaterials } from './RecipeMaterials';
import styles from './professions.module.css';

const root = '/wow/forever/professions';
const path = (lang: Lang, slug = '') => p(lang, `${root}${slug ? `/${slug}` : ''}`);
/** Recipes on one page of a profession: a phone scrolls a page of the list, not the whole craft. */
const PAGE = 25;

export function professionMetadata(lang: Lang, slug?: string, recipeId?: string): Metadata {
  const prof = slug ? professionBySlug(slug) : null;
  const recipe = recipeId && prof ? prof.recipes.find(r => String(r.id) === recipeId) : null;
  const title = recipe ? `${recipe.name[lang]} — ${prof!.name[lang]} · Forever` : prof ? `${prof.name[lang]} · Forever` : copy[lang].title;
  return { title: `${title} — WowArcana`, description: prof ? summaries[prof.slug][lang] : copy[lang].lede, alternates: pairedAlternates(lang, `${root}${slug ? `/${slug}` : ''}${recipeId ? `/${recipeId}` : ''}`) };
}

/** An item of a recipe as a line: its icon with the quality on the edge and the name in the quality colour. */
function itemLook(profession: Profession, id: number) {
  const item = profession.items[id];
  const colour = itemQualityColors[item.quality as keyof typeof itemQualityColors];
  return { item, name: colour ? { color: colour.text } : undefined, edge: colour ? { '--material-icon-edge': colour.frame } as CSSProperties : undefined };
}

/** /wow/forever/professions: the twelve professions by kind, each with its sign, what it makes and how much of it is new. */
export function ProfessionsHome({ lang }: { lang: Lang }) {
  const c = copy[lang];
  return <ForeverFrame lang={lang} page="professions">
    <ForeverHero lang={lang} trail={[{ label: c.crumb }]} title={c.title} lede={c.lede} />
    {(['crafting', 'gathering', 'secondary'] as const).map(kind => <AtlasSection key={kind} id={kind} title={c.kinds[kind]}>
      <ul className={styles.catalog} data-forever-cascade="">
        {professions.filter(pr => pr.kind === kind).map(pr => {
          const fresh = pr.recipes.filter(recipe => recipe.new).length;
          return <li key={pr.slug}>
            <ForeverPanel as="article" className={styles.card}>
              <ForeverIcon src={professionIcon(pr.icon)} size={64} />
              <div className={styles.cardHead}>
                <h3 className={styles.cardName}><Link href={path(lang, pr.slug)} prefetch={false}>{pr.name[lang]}</Link></h3>
                <p className={styles.cardFacts}><span>{c.recipeCount(pr.recipes.length)}</span>{fresh ? <span>{c.freshCount(fresh)}</span> : null}</p>
              </div>
              <p className={styles.cardText}>{summaries[pr.slug][lang]}</p>
            </ForeverPanel>
          </li>;
        })}
      </ul>
    </AtlasSection>)}
  </ForeverFrame>;
}

/** Where a recipe comes from, in the words of the «Learn from» filter. */
function recipeSource(recipe: Recipe, lang: Lang) {
  const c = copy[lang];
  return [recipe.auto ? c.automatic : null, recipe.trainers.length ? c.trainer : null, recipe.sourceItems.length ? c.recipe : null].filter(Boolean).join(' · ');
}

export function ProfessionPage({ lang, slug, filters }: { lang: Lang; slug: string; filters: RecipeFilters }) {
  const prof = professionBySlug(slug);
  if (!prof) notFound();
  const c = copy[lang];
  const found = filterRecipes(prof, filters);
  const pages = Math.max(1, Math.ceil(found.length / PAGE));
  const page = pageNumber(filters.page, found.length, PAGE);
  const recipes = found.slice((page - 1) * PAGE, page * PAGE);
  const list = `${path(lang, slug)}#recipes`;
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const key of ['q', 'source', 'skill', 'camp', 'fresh'] as const) if (filters[key]) q.set(key, filters[key]!);
    if (n > 1) q.set('page', String(n));
    return `${path(lang, slug)}${q.size ? `?${q}` : ''}#recipes`;
  };
  const filtered = Boolean(filters.q || filters.skill || filters.fresh || (filters.source && filters.source !== 'all') || (filters.camp && filters.camp !== 'all'));
  const fresh = prof.recipes.filter(recipe => recipe.new).length;
  return <ForeverFrame lang={lang} page="professions">
    <ForeverHero lang={lang} trail={[{ label: c.crumb, href: path(lang) }, { label: prof.name[lang] }]} eyebrow={c.kinds[prof.kind]}
      crest={<Image src={professionIcon(prof.icon)} alt="" width={64} height={64} unoptimized priority />}
      title={prof.name[lang]} lede={summaries[slug][lang]}
      stats={[{ value: prof.recipes.length, label: c.recipes }, ...(fresh ? [{ value: fresh, label: c.fresh }] : [])]} />
    <AtlasSection id="recipes" title={c.recipes}>
      <ForeverPanel>
        <ForeverFilters lang={lang} action={list} submit={c.find} reset={filtered ? list : undefined}
          search={<ForeverSearch name="q" label={c.search} placeholder={c.hint} defaultValue={filters.q ?? ''} />}>
          <ForeverLevel name="skill" label={c.skill} max={prof.maxSkill} defaultValue={filters.skill ?? ''} />
          <ForeverSelect name="source" label={c.source} defaultValue={filters.source ?? 'all'}
            options={[{ value: 'all', label: c.all }, { value: 'trainer', label: c.trainer }, { value: 'recipe', label: c.recipe }, { value: 'automatic', label: c.automatic }]} />
          <ForeverSelect name="camp" label={c.camp} defaultValue={filters.camp ?? 'all'} options={[{ value: 'all', label: c.any }, { value: 'yes', label: c.onlyCamp }]} />
          <div className={styles.check}><AtlasCheckbox name="fresh" value="yes" defaultChecked={filters.fresh === 'yes'} label={c.fresh} /></div>
        </ForeverFilters>
        {recipes.length ? <ForeverList label={c.recipes} className={styles.recipes}>
          {recipes.map(recipe => <ForeverListRow key={recipe.id} href={path(lang, `${slug}/${recipe.id}`)} icon={<ForeverIcon src={professionIcon(recipe.icon)} size={44} />}
            title={<>{recipe.name[lang]}{recipe.new ? <em className={styles.fresh}>{c.freshShort}</em> : null}</>}
            note={<span className={styles.reagents}>{recipe.reagents.map(reagent => <span key={reagent.id} className={styles.reagent}>
              <Image src={professionIcon(prof.items[reagent.id].icon)} alt="" width={20} height={20} unoptimized loading="lazy" />{reagent.quantity} × {prof.items[reagent.id].name[lang]}
            </span>)}</span>}
            values={<><span className={styles.source}>{recipeSource(recipe, lang)}</span>{recipe.requiredSkill !== null ? <span className={styles.skill}>{c.skillAt(recipe.requiredSkill)}</span> : null}</>} />)}
        </ForeverList> : <ForeverEmpty lang={lang}>{filtered ? sharedCopy[lang].emptyText : undefined}</ForeverEmpty>}
        <ForeverPager lang={lang} label={c.recipes} page={page} pages={pages} prev={page > 1 ? pageHref(page - 1) : undefined} next={page < pages ? pageHref(page + 1) : undefined} />
      </ForeverPanel>
    </AtlasSection>
    <AtlasSection id="ranks" title={c.ranks}>
      <ForeverStack>
        <ForeverPanel>
          <dl className={styles.facts}>{prof.ranks.map((rank, index) => <div key={rank.name}><dt>{c.rankNames[rank.name as keyof typeof c.rankNames]}</dt><dd>{index ? prof.ranks[index - 1].maxSkill : 1}–{rank.maxSkill}</dd></div>)}</dl>
        </ForeverPanel>
        {specializations[slug] ? <ForeverPanel title={c.specializations}><p className={foreverPanelStyles.text}>{specializations[slug][lang]}</p></ForeverPanel> : null}
      </ForeverStack>
    </AtlasSection>
    {prof.trainers.length > 0 && <AtlasSection id="trainers" title={c.trainers}>
      <ForeverPanel>
        <ForeverList label={c.trainers} className={styles.trainers}>
          {prof.trainers.map(trainer => <ForeverListRow key={trainer.id} title={trainer.name}
            note={trainer.zone ? `${trainer.zone}${trainer.x !== null && trainer.y !== null ? ` · ${trainer.x}, ${trainer.y}` : ''}` : undefined}
            values={<span>{trainer.faction === 'Alliance' ? c.alliance : trainer.faction === 'Horde' ? c.horde : c.neutral}</span>} />)}
        </ForeverList>
      </ForeverPanel>
    </AtlasSection>}
  </ForeverFrame>;
}

export function RecipePage({ lang, slug, recipeId }: { lang: Lang; slug: string; recipeId: string }) {
  const prof = professionBySlug(slug);
  const recipe = prof?.recipes.find(r => String(r.id) === recipeId);
  if (!prof || !recipe) notFound();
  const c = copy[lang];
  const output = recipe.output ? { ...itemLook(prof, recipe.output.id), id: recipe.output.id, amount: recipe.output.quantityRange ? recipe.output.quantityRange.join('–') : recipe.output.quantity } : null;
  const stats = [{ value: recipe.requiredSkill, label: c.required }, { value: recipe.yellow, label: c.yellow }, { value: recipe.grey, label: c.grey }]
    .filter((stat): stat is { value: number; label: string } => stat.value !== null);
  const learned = recipe.auto || recipe.trainers.length > 0 || recipe.sourceItems.length > 0;
  return <ForeverFrame lang={lang} page="professions">
    <ForeverHero lang={lang} trail={[{ label: c.crumb, href: path(lang) }, { label: prof.name[lang], href: path(lang, slug) }, { label: recipe.name[lang] }]}
      eyebrow={recipe.new ? `${prof.name[lang]} · ${c.fresh}` : prof.name[lang]}
      crest={<Image src={professionIcon(recipe.icon)} alt="" width={64} height={64} unoptimized priority />}
      title={recipe.name[lang]} stats={stats.length ? stats : undefined} />
    <div className={styles.recipe} data-forever-cascade="">
      <ForeverPanel as="section" title={c.materials} headingLevel={2}>
        <RecipeMaterials lang={lang} reagents={recipe.reagents.map(reagent => {
          const { item } = itemLook(prof, reagent.id);
          return { id: reagent.id, quantity: reagent.quantity, name: item.name[lang], icon: professionIcon(item.icon), quality: item.quality, href: foreverItemPath(reagent.id, lang) };
        })} />
        {recipe.tools.length > 0 || recipe.station ? <dl className={styles.facts} data-quiet="">
          {recipe.tools.length > 0 && <div><dt>{c.tools}</dt><dd>{recipe.tools.join(', ')}</dd></div>}
          {recipe.station && <div><dt>{c.station}</dt><dd>{recipe.station}</dd></div>}
        </dl> : null}
      </ForeverPanel>
      {output || learned ? <ForeverStack gap="wide">
        {output && <ForeverPanel as="section" title={c.output} headingLevel={2}>
          <ForeverList label={c.output}>
            <ForeverListRow href={foreverItemPath(output.id, lang)} icon={<span className={styles.itemIcon} style={output.edge}><ForeverIcon src={professionIcon(output.item.icon)} size={52} /></span>}
              title={<b className={styles.itemName} style={output.name}>{output.item.name[lang]}</b>} values={<span className={styles.amount}>× {output.amount}</span>} />
          </ForeverList>
        </ForeverPanel>}
        {learned && <ForeverPanel as="section" title={c.acquisition} headingLevel={2}>
          <ForeverList label={c.acquisition}>
            {recipe.auto ? <ForeverListRow title={c.automatic} /> : null}
            {recipe.trainers.map(name => {
              const trainer = prof.trainers.find(entry => entry.name === name);
              return <ForeverListRow key={name} title={name} note={trainer?.zone ? `${trainer.zone}${trainer.x !== null && trainer.y !== null ? ` · ${trainer.x}, ${trainer.y}` : ''}` : undefined} values={<span>{c.trainer}</span>} />;
            })}
            {recipe.sourceItems.map(id => {
              const source = itemLook(prof, id);
              return <ForeverListRow key={id} href={foreverItemPath(id, lang)} icon={<span className={styles.itemIcon} style={source.edge}><ForeverIcon src={professionIcon(source.item.icon)} size={44} /></span>}
                title={<b className={styles.itemName} style={source.name}>{source.item.name[lang]}</b>} values={<span>{c.recipe}</span>} />;
            })}
          </ForeverList>
        </ForeverPanel>}
      </ForeverStack> : null}
    </div>
  </ForeverFrame>;
}
