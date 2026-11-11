import Image from 'next/image';
import { FOREVER_KIT } from './classesKit';
import { AtlasDisclosure, AtlasField, AtlasInput, AtlasSelect } from '@/components/atlas';
import { MaterialButton, MaterialLinkButton, MaterialPlaque } from '@/components/wow/shared/materialAtlas';
import { p, type Lang } from '@/lib/i18n-paths';
import { foreverClasses } from '@/lib/data/wow/foreverClasses';
import { classChangeIconUrl, classSpellPath, matchesChanges, pageNumber, PAGE_SIZE, type ClassChange, type ChangeQuery, type ChangeRank, type ClassSlug } from '@/lib/data/wow/foreverClasses';
import { classesSnapshot as snapshot } from '@/lib/data/wow/foreverClasses';
import { classTrees } from '@/lib/data/wow/foreverClasses';
import { diffWords } from '@/lib/data/wow/foreverClasses';
import { classesCopy } from './classesCopy';
import styles from './classes.module.css';

const changes = snapshot.records as ClassChange[];
export function ChangeRankView({ rank, lang }: { rank: ChangeRank; lang: Lang }) {
  const t = classesCopy[lang];
  const href = classSpellPath(rank.spellId);
  const comparable = lang === "en" || (rank.before?.ru !== rank.before?.en && rank.after?.ru !== rank.after?.en);
  const diff = comparable && rank.before?.[lang] && rank.after?.[lang] ? diffWords(rank.before[lang], rank.after[lang]) : null;
  const percent = (v: number) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  return <div className={styles.rank}>
    <h3>{t.rank} {rank.rank}{rank.level ? <span className={styles.status}> · {t.level} {rank.level}</span> : null}</h3>
    <div className={styles.comparison} data-single={!rank.before?.[lang] || !rank.after?.[lang]}>
      {rank.before?.[lang] ? <div><h4>{t.before}</h4><p lang={lang === 'ru' && rank.before.ru === rank.before.en ? 'en' : lang}>{diff ? diff.before.map((token, i) => token.changed ? <del key={i}>{token.text}</del> : token.text) : rank.before[lang]}</p></div> : null}
      {rank.after?.[lang] ? <div><h4>{t.after}</h4><p lang={lang === 'ru' && rank.after.ru === rank.after.en ? 'en' : lang}>{diff ? diff.after.map((token, i) => token.changed ? <ins key={i}>{token.text}</ins> : token.text) : rank.after[lang]}</p></div> : null}
    </div>
    {rank.coefficient ? <p className={styles.coefficient}>{t.coefficient}: <span aria-label={t.before}>{percent(rank.coefficient.before)}</span> → <span aria-label={t.after}>{percent(rank.coefficient.after)}</span></p> : null}
    {href ? <a className={styles.classLink} href={p(lang, href)}>{t.record}</a> : null}
  </div>;
}
export function ClassChanges({ lang, classSlug, query, action, chooseClass = false }: { lang: Lang; classSlug: ClassSlug; query: ChangeQuery; action: string; chooseClass?: boolean }) {
  const t = classesCopy[lang];
  const filtered = matchesChanges(changes, classSlug, query);
  const page = pageNumber(query.page, filtered.length);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function href(nextPage: number) {
    const search = new URLSearchParams();
    if (chooseClass) search.set('class', classSlug);
    for (const key of ['kind', 'status', 'q'] as const) if (query[key]) search.set(key, query[key]!);
    if (nextPage > 1) search.set('page', String(nextPage));
    return `${p(lang, action)}${search.size ? `?${search}` : ''}#changes`;
  }
  return <MaterialPlaque kit={FOREVER_KIT}>
    <form className={styles.filters} method="get" action={`${p(lang, action)}#changes`}>
      {chooseClass ? <AtlasField label={t.class} htmlFor="change-class"><AtlasSelect id="change-class" name="class" defaultValue={classSlug}>{foreverClasses.map(c => <option key={c.slug} value={c.slug}>{c.name[lang]}</option>)}</AtlasSelect></AtlasField> : null}
      <AtlasField label={t.kind} htmlFor="change-kind"><AtlasSelect id="change-kind" name="kind" defaultValue={query.kind || ''}><option value="">{t.all}</option><option value="spellbook">{t.spellbook}</option><option value="talent">{t.talents}</option></AtlasSelect></AtlasField>
      <AtlasField label={t.status} htmlFor="change-status"><AtlasSelect id="change-status" name="status" defaultValue={query.status || ''}><option value="">{t.all}</option><option value="added">{t.added}</option><option value="changed">{t.changed}</option><option value="removed">{t.removed}</option></AtlasSelect></AtlasField>
      <div className={styles.search}><AtlasField label={t.search} htmlFor="change-search"><AtlasInput id="change-search" name="q" type="search" defaultValue={query.q || ''} /></AtlasField></div>
      <div className={styles.actions}><MaterialButton kit={FOREVER_KIT} type="submit">{t.apply}</MaterialButton><a href={`${p(lang, action)}${chooseClass ? `?class=${classSlug}` : ''}#changes`}>{t.reset}</a></div>
    </form>
    <div className={styles.changes}>
      {visible.length ? visible.map((row, index) => <AtlasDisclosure open={index === 0} key={row.key} summary={<span className={styles.summary}>{classChangeIconUrl(row.icon) ? <Image src={classChangeIconUrl(row.icon)!} unoptimized alt="" width={40} height={40} /> : null}<span>{row.name[lang]}{lang === 'ru' && row.name.ru !== row.name.en ? <span className={styles.alias} lang="en">{row.name.en}</span> : null}</span><span className={styles.status}>{t[row.status]} · {row.tree[lang]}</span></span>}>
        {row.status === 'removed' ? <p>{t.removedMeaning}</p> : null}
        {row.previousTree && row.previousTree !== row.tree.en ? <p>{t.tree}: {classTrees[row.classSlug].find(tree => tree.name.en === row.previousTree)?.name[lang] ?? row.previousTree} → {row.tree[lang]}</p> : null}
        {row.previousRow && row.row && row.previousRow !== row.row ? <p>{t.row}: {row.previousRow} → {row.row}</p> : null}
        {row.previousColumn && row.column && row.previousColumn !== row.column ? <p>{t.column}: {row.previousColumn} → {row.column}</p> : null}
        {row.previousMaxRank && row.status !== 'removed' && row.previousMaxRank !== row.ranks.length ? <p>{t.ranks}: {row.previousMaxRank} → {row.ranks.length}</p> : null}
        {row.ranks[0] ? <ChangeRankView rank={row.ranks[0]} lang={lang} /> : null}
        {row.ranks.length > 1 ? <AtlasDisclosure summary={t.moreRanks}><div className={styles.ranks}>{row.ranks.slice(1).map((rank, i) => <ChangeRankView key={`${rank.rank}-${i}`} rank={rank} lang={lang} />)}</div></AtlasDisclosure> : null}
      </AtlasDisclosure>) : <p role="status">{t.none}</p>}
    </div>
    {page > 1 || page * PAGE_SIZE < filtered.length ? <nav className={styles.pageNav} aria-label={t.changes}>
      {page > 1 ? <MaterialLinkButton kit={FOREVER_KIT} href={href(page - 1)}>{t.previous}</MaterialLinkButton> : <span />}
      {page * PAGE_SIZE < filtered.length ? <MaterialLinkButton kit={FOREVER_KIT} href={href(page + 1)}>{t.next}</MaterialLinkButton> : null}
    </nav> : null}
  </MaterialPlaque>;
}
