import { ArrowRight, ChevronDown, Minus } from 'lucide-react';
import { AtlasBadge, type AtlasBadgeTone } from '@gildra/atlas-ui/AtlasBadge';
import { AtlasDisclosure } from '@gildra/atlas-ui/AtlasDisclosure';
import { materialStyles } from '@/components/wow/shared/materialAtlas';
import { p, type Lang } from '@/lib/i18n-paths';
import { classChangeIconUrl, classSpellPath, matchesChanges, pageNumber, PAGE_SIZE, type ChangeQuery, type ChangeRank, type ChangeStatus, type ClassChange, type ClassSlug } from '@/lib/data/wow/foreverClasses';
import { classesSnapshot as snapshot, classTrees, diffWords } from '@/lib/data/wow/foreverClasses';
import { ForeverEmpty, ForeverFilters, ForeverIcon, ForeverList, ForeverPager, ForeverPanel, ForeverSearch, ForeverSelect, foreverIconFrame, foreverPanelStyles } from '../shared';
import { classesCopy } from './classesCopy';
import styles from './classes.module.css';

const changes = snapshot.records as ClassChange[];
const tones: Record<ChangeStatus, AtlasBadgeTone> = { added: 'positive', changed: 'neutral', moved: 'info', removed: 'negative' };
const ICON = 40;

/** One rank: Classic beside Forever with the changed words marked, the spell power scaling and the way to the spell. */
function ChangeRankView({ rank, lang }: { rank: ChangeRank; lang: Lang }) {
  const t = classesCopy[lang];
  const href = classSpellPath(rank.spellId);
  const before = rank.before?.[lang], after = rank.after?.[lang];
  const comparable = lang === 'en' || (rank.before?.ru !== rank.before?.en && rank.after?.ru !== rank.after?.en);
  const diff = comparable && before && after ? diffWords(before, after) : null;
  const percent = (value: number) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(value);
  return <div className={styles.rank}>
    <h4 className={styles.rankTitle}>{t.rank} {rank.rank}{rank.level ? <span> · {t.level} {rank.level}</span> : null}</h4>
    {before || after ? <div className={styles.comparison} data-single={!before || !after ? '' : undefined}>
      {before ? <div className={styles.side} data-side="before"><h5>{t.before}</h5><p lang={lang === 'ru' && rank.before!.ru === rank.before!.en ? 'en' : undefined}>{diff ? diff.before.map((token, i) => token.changed ? <del key={i}>{token.text}</del> : token.text) : before}</p></div> : null}
      {before && after ? <ArrowRight className={styles.becomes} aria-hidden="true" /> : null}
      {after ? <div className={styles.side} data-side="after"><h5>{t.after}</h5><p lang={lang === 'ru' && rank.after!.ru === rank.after!.en ? 'en' : undefined}>{diff ? diff.after.map((token, i) => token.changed ? <ins key={i}>{token.text}</ins> : token.text) : after}</p></div> : null}
    </div> : null}
    {rank.coefficient ? <p className={styles.fact}><span>{t.coefficient}</span><b><span aria-label={t.before}>{percent(rank.coefficient.before)}</span><ArrowRight aria-hidden="true" /><span aria-label={t.after}>{percent(rank.coefficient.after)}</span></b></p> : null}
    {href ? <a className={foreverPanelStyles.link} href={p(lang, href)}>{t.record}<ArrowRight aria-hidden="true" /></a> : null}
  </div>;
}

/** One change as a folded line: icon, name, tree, what happened; opened — Classic beside Forever. Works without JavaScript. */
function ChangeRow({ row, lang }: { row: ClassChange; lang: Lang }) {
  const t = classesCopy[lang];
  const icon = classChangeIconUrl(row.icon);
  const moves: Array<[string, string | number, string | number]> = [];
  const moved = (label: string, was: string | number | undefined, now: string | number | undefined) => { if (was && now && was !== now) moves.push([label, was, now]); };
  if (row.previousTree && row.previousTree !== row.tree.en) moves.push([t.tree, classTrees[row.classSlug].find(tree => tree.name.en === row.previousTree)?.name[lang] ?? row.previousTree, row.tree[lang]]);
  moved(t.row, row.previousRow, row.row);
  moved(t.column, row.previousColumn, row.column);
  if (row.status !== 'removed') moved(t.ranks, row.previousMaxRank, row.ranks.length);
  return <li>
    {/* A reader may open a line before the page hydrates: the `open` they set is theirs to keep. */}
    <details className={styles.change} suppressHydrationWarning>
      <summary>
        {icon ? <ForeverIcon src={icon} size={ICON} /> : <span className={`${materialStyles.iconFrame} ${styles.noIcon}`} style={foreverIconFrame(ICON)} aria-hidden="true"><Minus /></span>}
        <strong className={styles.changeName}>{row.name[lang]}</strong>
        <span className={styles.changeMeta}>
          <span className={styles.changeNote}>{row.tree[lang]}{lang === 'ru' && row.name.ru !== row.name.en ? <span className={styles.alias}> · <span lang="en">{row.name.en}</span></span> : null}</span>
          <AtlasBadge tone={tones[row.status]} className={styles.badge}>{t[row.status]}</AtlasBadge>
        </span>
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </summary>
      <div className={styles.changeBody}>
        {row.status === 'removed' ? <p className={styles.meaning}>{t.removedMeaning}</p> : null}
        {moves.length ? <div className={styles.moves}>{moves.map(([label, was, now]) => <p key={label} className={styles.fact}><span>{label}</span><b>{was}<ArrowRight aria-hidden="true" />{now}</b></p>)}</div> : null}
        {row.ranks[0] ? <ChangeRankView rank={row.ranks[0]} lang={lang} /> : null}
        {row.ranks.length > 1 ? <AtlasDisclosure className={styles.moreRanks} summary={t.moreRanks}>{row.ranks.slice(1).map((rank, i) => <ChangeRankView key={`${rank.rank}-${i}`} rank={rank} lang={lang} />)}</AtlasDisclosure> : null}
      </div>
    </details>
  </li>;
}

/** The changes of one class on the section's panel: the filter bar, the folded list, paging. The filters live in the address. */
export function ClassChanges({ lang, classSlug, query, action, chooseClass = false }: { lang: Lang; classSlug: ClassSlug; query: ChangeQuery; action: string; /** The page lists every class (/changes): the class stays in the address. */ chooseClass?: boolean }) {
  const t = classesCopy[lang];
  const own = changes.filter(row => row.classSlug === classSlug);
  const filtered = matchesChanges(changes, classSlug, query);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = pageNumber(query.page, filtered.length);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const base = `${p(lang, action)}${chooseClass ? `?class=${classSlug}` : ''}#changes`;
  function href(nextPage: number) {
    const search = new URLSearchParams();
    if (chooseClass) search.set('class', classSlug);
    for (const key of ['kind', 'status', 'q'] as const) if (query[key]) search.set(key, query[key]!);
    if (nextPage > 1) search.set('page', String(nextPage));
    return `${p(lang, action)}${search.size ? `?${search}` : ''}#changes`;
  }
  // The hint names what can be typed: two changes of this class and one of its trees.
  const hint = [own.find(row => row.status === 'changed'), own.find(row => row.status === 'added')].flatMap(row => row ? [row.name[lang]] : []).concat(classTrees[classSlug][0].name[lang]).join(', ');
  return <ForeverPanel>
    <ForeverFilters lang={lang} inline action={`${p(lang, action)}#changes`} hidden={{ class: chooseClass ? classSlug : undefined }}
      reset={query.kind || query.status || query.q ? base : undefined}
      search={<ForeverSearch name="q" label={t.search} placeholder={`${hint}…`} defaultValue={query.q || ''} />}>
      <ForeverSelect name="kind" label={t.kind} defaultValue={query.kind || ''} options={[{ value: '', label: t.all }, { value: 'spellbook', label: t.spellbook }, { value: 'talent', label: t.talents }]} />
      <ForeverSelect name="status" label={t.status} defaultValue={query.status || ''} options={[{ value: '', label: t.all }, { value: 'added', label: t.added }, { value: 'changed', label: t.changed }, { value: 'removed', label: t.removed }]} />
    </ForeverFilters>
    {visible.length ? <ForeverList label={t.changes} className={styles.changes}>{visible.map(row => <ChangeRow key={row.key} row={row} lang={lang} />)}</ForeverList> : <ForeverEmpty lang={lang} reset={base} />}
    <ForeverPager lang={lang} label={t.changes} page={page} pages={pages} prev={page > 1 ? href(page - 1) : undefined} next={page < pages ? href(page + 1) : undefined} />
  </ForeverPanel>;
}
