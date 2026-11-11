import { ResilientImage } from "@/components/media/ResilientImage";
import { LibraryRecordCard } from "@/components/library/LibraryRecordCard";
import { FOREVER_KIT } from "./libraryKit";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { notFound } from "next/navigation";
import { AtlasHero, AtlasSection, AtlasField, AtlasInput, AtlasSelect, AtlasDisclosure, AtlasEmpty } from "@/components/atlas";
import { MaterialButton, MaterialPlaque, materialIconFrameStyle, materialStyles } from "@/components/wow/shared/materialAtlas";
import { ForeverFrame } from "../ForeverFrame";
import { FOREVER_TYPES, foreverIconUrl, foreverRecordPath, isForeverType, type ForeverLocale, type ForeverSummary } from "@/lib/forever/database/contract";
import { foreverSearch, foreverRecord, type ForeverQuery } from "@/lib/forever/database/server";
import { libraryCopy } from "./libraryCopy";
import { LibraryPagination } from "./LibraryPagination";
import { slotNames } from "./slotNames";
import styles from "./library.module.css";

const base = (lang: ForeverLocale) => `${lang === "ru" ? "/ru" : ""}/wow/forever/library`;
function RecordIcon({ record, size=40 }: { record: ForeverSummary; size?:number }) {
  return record.icon ? <span className={materialStyles.iconFrame} style={materialIconFrameStyle(FOREVER_KIT,size)}><ResilientImage src={foreverIconUrl(record.icon)} alt="" width={size} height={size} /></span> : null;
}
function RecordLink({ record, lang }: { record: ForeverSummary; lang: ForeverLocale }) {
  const t = libraryCopy[lang];
  return <a className={styles.link} href={foreverRecordPath(record.type, record.id, lang)}><RecordIcon record={record} /><span className={styles.name}>{record.name[lang] || record.name.en}<span className={styles.meta}>{[record.level ? `${t.facts.level} ${record.level}` : null, record.requiredLevel ? `${t.facts.requiredLevel} ${record.requiredLevel}` : null, record.quality !== undefined ? t.qualities[record.quality] : null].filter(Boolean).join(" · ")}</span></span></a>;
}
export async function LibraryPage({ lang, query }: { lang: ForeverLocale; query: ForeverQuery }) {
  const t = libraryCopy[lang]; const result = await foreverSearch(query);
  const pageUrl = (page: number) => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(query)) if (value) params.set(key, value); params.set("page", String(page)); return `${base(lang)}?${params}`; };
  return <ForeverFrame lang={lang}><AtlasHero title={t.title} breadcrumbs={[{label:"Forever",href:base(lang).replace("/library","") }]} />
    <nav className={styles.types} aria-label={t.type}>{FOREVER_TYPES.map(type=><a key={type} aria-current={type===result.type?"page":undefined} href={`${base(lang)}?type=${type}`}>{t.types[type]}</a>)}</nav>
    <MaterialPlaque kit={FOREVER_KIT}>
      <form action={base(lang)} className={styles.filters}>
        <AtlasField label={t.search} htmlFor="library-q"><AtlasInput id="library-q" name="q" type="search" maxLength={120} defaultValue={query.q} /></AtlasField>
        <input type="hidden" name="type" value={result.type} />
        {result.type === "item" && <AtlasField label={t.quality} htmlFor="library-quality"><AtlasSelect id="library-quality" name="quality" defaultValue={query.quality ?? ""}><option value="">{t.all}</option>{t.qualities.map((name,i)=><option key={i} value={i}>{name}</option>)}</AtlasSelect></AtlasField>}
        {result.type === "recipe" && <AtlasField label={t.profession} htmlFor="library-profession"><AtlasSelect name="category" id="library-profession" defaultValue={query.category ?? ""}><option value="">{t.all}</option>{result.categories.map(category=><option key={category} value={category}>{t.professions[category as keyof typeof t.professions] || category}</option>)}</AtlasSelect></AtlasField>}
        {result.type !== "recipe" && <AtlasField label={t.min} htmlFor="library-min"><AtlasInput id="library-min" name="minLevel" type="number" min={0} max={999} defaultValue={query.minLevel} /></AtlasField>}
        {result.type !== "recipe" && <AtlasField label={t.max} htmlFor="library-max"><AtlasInput id="library-max" name="maxLevel" type="number" min={0} max={999} defaultValue={query.maxLevel} /></AtlasField>}
        <MaterialButton kit={FOREVER_KIT} type="submit">{t.submit}</MaterialButton>
        {query.related && <input type="hidden" name="related" value={query.related} />}
        {query.edge && <input type="hidden" name="edge" value={query.edge} />}
      </form>
      {Object.values(query).some(Boolean) && <a href={base(lang)}>{t.reset}</a>}
      {result.records.length ? <ul className={styles.cards}>{result.records.map(record=><LibraryRecordCard key={record.id} id={`forever:${record.type}:${record.id}`} href={foreverRecordPath(record.type,record.id,lang)} name={record.name[lang]||record.name.en} lang={lang} layout="cards" iconUrl={foreverIconUrl(record.icon)} quality={record.quality} itemLevel={record.level} slot={record.slotId ? slotNames[lang][record.slotId] : undefined} facts={record.requiredLevel?[`${t.facts.requiredLevel} ${record.requiredLevel}`]:[]} iconFrameStyle={materialIconFrameStyle(FOREVER_KIT,54)} />)}</ul> : <AtlasEmpty title={t.empty} action={<a href={base(lang)}>{t.reset}</a>} />}

      <LibraryPagination label={t.title} prev={result.page>1?{href:pageUrl(result.page-1),label:t.previous}:undefined} next={result.page<result.pages?{href:pageUrl(result.page+1),label:t.next}:undefined} status={`${result.page} / ${result.pages}`} />
    </MaterialPlaque>
  </ForeverFrame>;
}
export async function LibraryRecordPage({ lang, type, id }: { lang: ForeverLocale; type: string; id: string }) {
  if (!isForeverType(type) || !/^[1-9]\d{0,9}$/.test(id)) notFound();
  const record=await foreverRecord(type,Number(id)); if (!record) notFound();
  const t=libraryCopy[lang];
  const groups = new Map<string,typeof record.relations>();
  for(const edge of record.relations) { const key=`${edge.kind}|${edge.type}`; groups.set(key,[...(groups.get(key)??[]),edge]); }
  const relatedGroups=await Promise.all([...groups.entries()].map(async([key,edges])=>({key,edges,records:await Promise.all(edges.slice(0,20).map(edge=>foreverRecord(edge.type,edge.id)))})));
  const quality=record.quality!==undefined?itemQualityColors[record.quality as keyof typeof itemQualityColors]:undefined;
  const facts={level:record.level,requiredLevel:record.requiredLevel,...record.facts};
  return <ForeverFrame lang={lang}><AtlasHero title={<span style={quality?{color:quality.text}:undefined}>{record.name[lang] || record.name.en}</span>} emblem={<RecordIcon record={record} size={96}/>} breadcrumbs={[{label:"Forever",href:base(lang).replace("/library","")},{label:t.title,href:base(lang)},{label:t.types[type],href:`${base(lang)}?type=${type}`}]} />
    <MaterialPlaque kit={FOREVER_KIT}>
      {record.slotId ? <p>{slotNames[lang][record.slotId]}</p> : null}
      {record.description && <p className={styles.description}>{record.description[lang] || record.description.en}</p>}
      {record.effects?.map((effect,index)=><p key={index} className={styles.description}>{effect}</p>)}
      {record.locations?.length ? <ul>{record.locations.map(location=><li key={location}>{location}</li>)}</ul> : null}
      <dl className={styles.facts}>{Object.entries(facts).filter(([key,value])=>value!==undefined && key in t.facts).map(([key,value])=><div key={key}><dt>{t.facts[key as keyof typeof t.facts]}</dt><dd>{value}</dd></div>)}{record.attributes?.map((attribute,index)=><div key={`attribute-${index}`}><dt>{attribute.name[lang]||attribute.name.en}</dt><dd>{attribute.value>0?"+":""}{attribute.value}</dd></div>)}</dl>
    </MaterialPlaque>
    {relatedGroups.length>0 && <AtlasSection id="related" title={t.related}>{relatedGroups.map((group,index)=>{
      const edge=group.edges[0];const label=t.edges[edge.kind as keyof typeof t.edges] || t.types[edge.type];
      const url=`${base(lang)}?${new URLSearchParams({type:edge.type,related:`${type}:${id}`,edge:edge.kind})}`;
      return <AtlasDisclosure key={group.key} summary={label} open={index<2}><ul className={styles.rows}>{group.records.map((target,i)=>target && <li className={styles.row} key={i}><RecordLink record={target} lang={lang}/>{group.edges[i].quantity ? <span>× {group.edges[i].quantityRange?.join("–") ?? group.edges[i].quantity}</span>:null}</li>)}</ul>{group.edges.length>20 && <a href={url}>{t.showAll} {group.edges.length}</a>}</AtlasDisclosure>;
    })}</AtlasSection>}
  </ForeverFrame>;
}
