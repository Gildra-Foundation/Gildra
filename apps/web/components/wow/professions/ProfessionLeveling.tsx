"use client";
import Image from "next/image";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, BookOpen, Check, Coins, FlaskConical, GitBranch, GraduationCap, Info, MapPin, ScrollText, Skull, Store } from "lucide-react";
import { LibraryHoverPreview } from "@/components/library/LibraryHoverPreview";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import { libraryRecordPath } from "@/lib/library/recordPath";
import {
  buyCost, DEFAULT_ROUTE_SOURCES, planRoute, professionIconUrl, ROUTE_SOURCES, shoppingList, skillBand, wayCommand,
  type RouteStep, type SpecializationUnlock,
} from "@/lib/wow/professions/leveling";
import type { ProfessionCurrency, ProfessionItem, ProfessionPlace, ProfessionPrices, ProfessionRecipe, RecipeCost, RecipePlace, RecipeSource } from "@/lib/wow/professions/types";
import { CopyCommand } from "./CopyCommand";
import { ProfessionIcon, ProfessionMoney, ProfessionRank } from "./ProfessionParts";
import { DIFFICULTY_STYLE, PROFESSION_KIT } from "./professionKit";
import { professionsCopy } from "./professionsCopy";
import styles from "./professionLeveling.module.css";

type Lang = "en" | "ru";
type Items = Record<string, ProfessionItem>;
type Records = Record<string, { id: string; slug: string }>;
type Props = {
  lang: Lang; recipes: ProfessionRecipe[]; items: Items; prices: ProfessionPrices; maxSkill: number;
  trainer: ProfessionPlace; unlocks: Record<number, SpecializationUnlock>; currencies: Record<string, ProfessionCurrency>;
  records: Records; libraryOpen: boolean; icon: string | null;
};
type Copy = (typeof professionsCopy)[Lang];

const SOURCE_ICONS: Record<RecipeSource, typeof Store> = {
  start: Check, trainer: GraduationCap, research: FlaskConical, specialization: GitBranch, vendor: Store, quest: ScrollText, drop: Skull,
};

const qualityStyle = (quality: number | null | undefined) => {
  const palette = itemQualityColors[quality as keyof typeof itemQualityColors];
  return palette ? { "--profession-quality": palette.frame, "--profession-quality-text": palette.text } as CSSProperties : undefined;
};

/** Item or recipe name: a library link with the game tooltip on hover when the library has the record. */
function ItemName({ id, name, records, lang, libraryOpen, className }: { id: number | undefined; name: string; records: Records; lang: Lang; libraryOpen: boolean; className?: string }) {
  const record = id ? records[id] : undefined;
  if (!record || !libraryOpen) return <span className={className}>{name}</span>;
  return <a className={className} href={libraryRecordPath(lang, "item", record.id, record.slug)}>{name}</a>;
}

function Way({ place, c }: { place: RecipePlace | ProfessionPlace; c: Copy }) {
  if (!place.map || place.x === undefined || place.y === undefined) return null;
  return <CopyCommand text={wayCommand({ map: place.map, x: place.x, y: place.y }, place.name.en)} copy={c.copy} copied={c.copied} failed={c.copyFailed} label={c.way} show={false} />;
}

function Cost({ cost, currencies, lang }: { cost: RecipeCost; currencies: Record<string, ProfessionCurrency>; lang: Lang }) {
  const parts: ReactNode[] = [];
  if (cost.gold) parts.push(<ProfessionMoney key="gold" value={cost.gold} lang={lang} />);
  for (const [id, amount] of cost.currencies ?? []) {
    const currency = currencies[id];
    parts.push(<span key={`c${id}`} className={styles.currency}>
      {amount.toLocaleString(lang)}
      {currency?.icon ? <Image src={professionIconUrl(currency.icon) ?? ""} alt="" width={16} height={16} unoptimized loading="lazy" /> : null}
      <span className={styles.currencyName}>{currency?.name[lang] ?? ""}</span>
    </span>);
  }
  for (const [id, amount] of cost.items ?? []) {
    const item = currencies[`item:${id}`];
    parts.push(<span key={`i${id}`} className={styles.currency}>
      {amount.toLocaleString(lang)}
      {item?.icon ? <Image src={professionIconUrl(item.icon) ?? ""} alt="" width={16} height={16} unoptimized loading="lazy" /> : null}
      <span className={styles.currencyName}>{item?.name[lang] ?? ""}</span>
    </span>);
  }
  return parts.length ? <span className={styles.cost}>{parts}</span> : null;
}

/** Where and for what the recipe is learned, in one line, with a waypoint where there is a place. */
function Learn({ recipe, trainer, unlocks, currencies, lang }: { recipe: ProfessionRecipe; trainer: ProfessionPlace; unlocks: Props["unlocks"]; currencies: Props["currencies"]; lang: Lang }) {
  const c = professionsCopy[lang], learn = recipe.learn, Icon = SOURCE_ICONS[recipe.source];
  const skill = learn?.skill && learn.skill > 1 ? <span className={styles.learnNote}>{c.learnSkill(learn.skill)}</span> : null;
  let text: ReactNode, place: RecipePlace | ProfessionPlace | undefined, extra: ReactNode = null;
  switch (recipe.source) {
    case "start": text = c.learnStart; break;
    case "trainer":
      text = c.learnTrainer(trainer.name[lang], trainer.zone[lang]); place = trainer;
      extra = recipe.trainingCost ? <ProfessionMoney value={recipe.trainingCost} lang={lang} /> : null;
      break;
    case "research":
      if (learn?.station) { text = c.learnStation(learn.station.name[lang], learn.station.zone?.[lang] ?? ""); place = learn.station; }
      else text = c.learnDiscovery;
      break;
    case "specialization": {
      const unlock = unlocks[recipe.spell];
      text = unlock ? <>{unlock.node[lang] === unlock.tree[lang] ? `«${unlock.node[lang]}»` : c.learnSpec(unlock.node[lang], unlock.tree[lang])} <span className={styles.learnNote}>· {c.learnSpecAt(unlock.at)}</span></> : c.sources.specialization;
      break;
    }
    case "vendor": {
      const [first, second] = learn?.vendors ?? [];
      place = first;
      text = first ? <>
        {c.learnVendor(first.name[lang], first.zone?.[lang] ?? "")}
        {second ? <span className={styles.learnNote}> {c.learnOr} {c.learnVendor(second.name[lang], second.zone?.[lang] ?? "")}</span> : null}
      </> : c.sources.vendor;
      extra = <>
        {learn?.cost ? <Cost cost={learn.cost} currencies={currencies} lang={lang} /> : null}
        {learn?.renown ? <span className={styles.renown}>{c.learnRenown(learn.renown.faction[lang], learn.renown.rank)}</span> : null}
      </>;
      break;
    }
    case "drop": {
      const drops = (learn?.drops ?? []).filter((d) => d.kind !== "world");
      text = drops.length ? <>{drops.map((d) => d.name ? `${d.name[lang]}${d.zone ? ` (${d.zone[lang]})` : ""}` : d.zone?.[lang] ?? "").filter(Boolean).join(", ")}</> : c.learnWorldDrop;
      break;
    }
    case "quest": text = c.learnQuest; break;
  }
  return <div className={styles.learn} data-source={recipe.source}>
    <span className={styles.learnIcon} aria-hidden="true"><Icon size={16} /></span>
    <span className={styles.learnBody}>
      <span className={styles.learnKind}>{c.sources[recipe.source]}</span>
      <span className={styles.learnText}>{text} {skill}</span>
      {extra ? <span className={styles.learnExtra}>{extra}</span> : null}
    </span>
    {place ? <span className={styles.learnWay}><MapPin size={14} aria-hidden="true" /><Way place={place} c={c} /></span> : null}
  </div>;
}

/** The recipe's difficulty on the 1–max track (orange, yellow, green, grey) with this step's window drawn over it. */
function Band({ recipe, from, to, max, c }: { recipe: ProfessionRecipe; from: number; to: number; max: number; c: Copy }) {
  const band = skillBand(recipe);
  const pct = (value: number) => `${(Math.min(max, Math.max(0, value)) / max) * 100}%`;
  return <div className={styles.band} role="img" aria-label={c.band(from, to)}>
    <span className={styles.bandTrack} aria-hidden="true">
      <span className={styles.bandOrange} style={{ insetInlineEnd: `calc(100% - ${pct(band.yellow)})` }} />
      <span className={styles.bandYellow} style={{ insetInlineStart: pct(band.yellow), insetInlineEnd: `calc(100% - ${pct(band.green)})` }} />
      <span className={styles.bandGreen} style={{ insetInlineStart: pct(band.green), insetInlineEnd: `calc(100% - ${pct(band.grey)})` }} />
      <span className={styles.bandGrey} style={{ insetInlineStart: pct(band.grey) }} />
      <span className={styles.bandWindow} style={{ insetInlineStart: pct(from), insetInlineEnd: `calc(100% - ${pct(to)})` }} />
    </span>
    <span className={styles.bandScale} aria-hidden="true">
      {to - from >= max * 0.12 ? <>
        <span style={{ insetInlineStart: pct(from) }}>{from}</span>
        <span style={{ insetInlineStart: pct(to) }}>{to}</span>
      </> : <span className={styles.bandScaleOne} style={{ insetInlineStart: pct((from + to) / 2) }}>{from}–{to}</span>}
    </span>
  </div>;
}

function Step({ step, index, props }: { step: RouteStep; index: number; props: Props }) {
  const { lang, items, records, libraryOpen, maxSkill } = props;
  const c = professionsCopy[lang], recipe = step.recipe;
  const output = recipe.output ? items[recipe.output.item] : undefined;
  const outputRecord = recipe.output ? records[recipe.output.item] : undefined;
  return <li className={styles.step} id={`step-${index + 1}`}>
    <span className={styles.stepMarker} aria-hidden="true"><span>{index + 1}</span></span>
    <article className={styles.stepCard} aria-labelledby={`step-${index + 1}-name`}>
      <header className={styles.stepHead}>
        <span className={styles.stepIcon} style={qualityStyle(output?.quality)} data-hover-preview={libraryOpen ? outputRecord?.id : undefined}
          data-hover-icon={professionIconUrl(output?.icon) ?? undefined}>
          <ProfessionIcon url={professionIconUrl(output?.icon)} size={52} />
        </span>
        <div className={styles.stepTitle}>
          <span className={styles.stepRange}><span className={styles.visuallyHidden}>{c.stepTitle(index + 1)}: </span>{step.from} → {step.to}</span>
          <h3 className={styles.stepName} id={`step-${index + 1}-name`} style={qualityStyle(output?.quality)}
            data-hover-preview={libraryOpen ? outputRecord?.id : undefined} data-hover-icon={professionIconUrl(output?.icon) ?? undefined}>
            <ItemName id={recipe.output?.item} name={recipe.name[lang]} records={records} lang={lang} libraryOpen={libraryOpen} />
          </h3>
          <span className={styles.stepCategory}>{recipe.category[lang]}</span>
        </div>
        <div className={styles.stepNumbers}>
          <span className={styles.stepCrafts}>{c.craftsCount(step.crafts)}</span>
          {step.cost !== null ? <span className={styles.stepCost}><ProfessionMoney value={Math.round(step.cost)} lang={lang} /></span> : null}
        </div>
      </header>
      <Band recipe={recipe} from={step.from} to={step.to} max={maxSkill} c={c} />
      <ul className={styles.reagents} aria-label={c.reagents}>
        {recipe.reagents.map(([id, qty]) => {
          const item = items[id], record = records[id];
          return <li key={id} className={styles.reagent} style={qualityStyle(item?.quality)} data-hover-preview={libraryOpen ? record?.id : undefined} data-hover-icon={professionIconUrl(item?.icon) ?? undefined}>
            <ProfessionIcon url={professionIconUrl(item?.icon)} size={30} />
            <ItemName id={id} name={item?.name[lang] ?? String(id)} records={records} lang={lang} libraryOpen={libraryOpen} className={styles.reagentName} />
            <span className={styles.reagentQty}>×{(qty * step.crafts).toLocaleString(lang)}</span>
          </li>;
        })}
      </ul>
      <Learn recipe={recipe} trainer={props.trainer} unlocks={props.unlocks} currencies={props.currencies} lang={lang} />
    </article>
  </li>;
}

/** Cheapest leveling route at current prices as a step-by-step guide; recomputed as the player changes the start, sources and stock. */
export function ProfessionLeveling(props: Props) {
  const { lang, recipes, items, prices, maxSkill, records, libraryOpen } = props;
  const c = professionsCopy[lang];
  const legendId = useId();
  const available = useMemo(() => ROUTE_SOURCES.filter((source) => recipes.some((recipe) => recipe.source === source)), [recipes]);
  const [from, setFrom] = useState(1);
  const [legend, setLegend] = useState(false);
  const [sources, setSources] = useState<RecipeSource[]>(() => available.filter((source) => DEFAULT_ROUTE_SOURCES.includes(source)));
  const [have, setHave] = useState<Record<number, number>>({});
  const route = useMemo(() => planRoute(recipes, items, prices, { from, to: maxSkill, sources }), [recipes, items, prices, from, maxSkill, sources]);
  const list = useMemo(() => shoppingList(route.steps, items, prices), [route, items, prices]);
  const costs = list.map((entry) => buyCost(entry, entry.qty - (have[entry.item] ?? 0), items, prices));
  const reagents = costs.reduce((sum, cost) => sum + (cost?.total ?? 0), 0);
  const total = reagents + route.trainingCost;
  const toggle = (source: RecipeSource) => setSources((current) => current.includes(source) ? current.filter((s) => s !== source) : [...current, source]);
  const groups = [
    { key: "auction", title: c.fromAuction, rows: list.map((entry, i) => ({ entry, cost: costs[i] })).filter(({ entry }) => !entry.buy?.vendor) },
    { key: "vendor", title: c.fromVendor, rows: list.map((entry, i) => ({ entry, cost: costs[i] })).filter(({ entry }) => entry.buy?.vendor) },
  ].filter((group) => group.rows.length);
  const span = Math.max(1, maxSkill - from);

  return <div className={styles.leveling} id="profession-leveling" style={DIFFICULTY_STYLE}>
    <MaterialPlaque kit={PROFESSION_KIT} as="aside" className={styles.summary} aria-label={c.leveling}>
      <div className={styles.summaryHead}>
        {props.icon ? <span className={styles.summaryIcon}><ProfessionIcon url={professionIconUrl(props.icon)} size={44} /></span> : null}
        <span className={styles.summaryRange}>{from} → {route.reached}</span>
      </div>
      {route.priced ? <div className={styles.total}>
        <span className={styles.totalLabel}>{c.total}</span>
        <span className={styles.totalValue}><ProfessionMoney value={Math.round(total)} lang={lang} /></span>
        <dl className={styles.totalParts}>
          <div><dt>{c.reagentsCost}</dt><dd><ProfessionMoney value={Math.round(reagents)} lang={lang} /></dd></div>
          {route.trainingCost > 0 ? <div><dt>{c.training}</dt><dd><ProfessionMoney value={route.trainingCost} lang={lang} /></dd></div> : null}
        </dl>
      </div> : null}

      {route.steps.length ? <ol className={styles.overview} aria-label={c.stepsLabel}>
        {route.steps.map((step, i) => <li key={`${step.from}-${step.recipe.id}`} style={{ flexGrow: step.to - step.from }}>
          <a href={`#step-${i + 1}`} className={styles.overviewLink} title={`${step.from}–${step.to} · ${step.recipe.name[lang]}`}>
            <span className={styles.visuallyHidden}>{c.stepTitle(i + 1)}: {step.from}–{step.to}, {step.recipe.name[lang]}</span>
          </a>
        </li>)}
        {route.reached < maxSkill ? <li className={styles.overviewGap} style={{ flexGrow: maxSkill - route.reached }} aria-hidden="true" /> : null}
      </ol> : null}
      <span className={styles.overviewScale} aria-hidden="true"><span>{from}</span><span>{Math.round(from + span / 2)}</span><span>{maxSkill}</span></span>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>{c.from}</span>
        <span className={styles.skillInput}>
          <input className={styles.range} type="range" min={1} max={maxSkill - 1} value={from} aria-hidden="true" tabIndex={-1}
            onChange={(event) => setFrom(Number(event.target.value))} />
          <input className={styles.number} type="number" inputMode="numeric" min={1} max={maxSkill - 1} value={from}
            onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setFrom(Math.min(maxSkill - 1, Math.max(1, Math.floor(value)))); }} />
        </span>
      </label>

      <fieldset className={styles.sources}>
        <legend className={styles.fieldLabel}>
          {c.recipesFrom}
          <button type="button" className={styles.legendButton} aria-expanded={legend} aria-controls={legendId} onClick={() => setLegend((open) => !open)}>
            <Info size={14} aria-hidden="true" /><span className={styles.visuallyHidden}>{c.legend}</span>
          </button>
        </legend>
        <div className={styles.chips}>
          {available.map((source) => {
            const Icon = SOURCE_ICONS[source];
            return <label key={source} className={styles.chip} data-source={source}>
              <input type="checkbox" checked={sources.includes(source)} onChange={() => toggle(source)} />
              <span><Icon size={14} aria-hidden="true" />{c.sources[source]}</span>
            </label>;
          })}
        </div>
        <dl className={styles.legend} id={legendId} hidden={!legend}>
          {available.map((source) => <div key={source}><dt>{c.sources[source]}</dt><dd>{c.sourceHelp[source]}</dd></div>)}
        </dl>
      </fieldset>

      <ul className={styles.difficulty} aria-hidden="true">
        {(["orange", "yellow", "green", "grey"] as const).map((key) => <li key={key} data-difficulty={key}>{c.difficulty[key]}</li>)}
      </ul>
      {route.steps.length ? <a className={styles.toShopping} href="#shopping"><ArrowDown size={14} aria-hidden="true" />{c.toShopping}</a> : null}
    </MaterialPlaque>

    <div className={styles.main}>
      {!route.priced ? <p className={styles.notice} role="status">{c.noPrices}</p> : null}
      {route.steps.length === 0 ? <p className={styles.notice} role="status">{c.noRoute}</p> : <>
        <ol className={styles.steps} aria-label={c.stepsLabel}>
          {route.steps.map((step, i) => <Step key={`${step.from}-${step.recipe.id}`} step={step} index={i} props={props} />)}
        </ol>
        {route.reached < maxSkill ? <p className={styles.notice} role="status">{c.reachedOnly(route.reached)}</p> : null}
      </>}
    </div>

    {route.steps.length ? <MaterialPlaque kit={PROFESSION_KIT} as="section" className={styles.shopping} aria-labelledby="shopping">
      <h3 className={styles.shoppingTitle} id="shopping"><BookOpen size={18} aria-hidden="true" />{c.shopping}</h3>
      {groups.map((group) => <section key={group.key} className={styles.shopGroup} aria-label={group.title}>
        <h4 className={styles.shopGroupTitle}>{group.key === "vendor" ? <Store size={14} aria-hidden="true" /> : <Coins size={14} aria-hidden="true" />}{group.title}</h4>
        <ul className={styles.shopList}>
          {group.rows.map(({ entry, cost }) => {
            const info = items[entry.item], record = records[entry.item];
            const left = Math.max(0, entry.qty - (have[entry.item] ?? 0));
            return <li key={entry.item} className={styles.shopRow} data-done={left === 0 || undefined}>
              <span className={styles.shopItem} style={qualityStyle(info?.quality)} data-hover-preview={libraryOpen ? record?.id : undefined} data-hover-icon={professionIconUrl(info?.icon) ?? undefined}>
                <ProfessionIcon url={professionIconUrl(info?.icon)} size={36} />
                <span className={styles.shopName}>
                  <ItemName id={entry.item} name={info?.name[lang] ?? String(entry.item)} records={records} lang={lang} libraryOpen={libraryOpen} />
                  <ProfessionRank rank={info?.ranks && entry.buy && !entry.buy.vendor ? entry.buy.rank : null} lang={lang} />
                </span>
              </span>
              <span className={styles.shopNeed}><span className={styles.shopLabel}>{c.need}</span>{entry.qty.toLocaleString(lang)}</span>
              <label className={styles.shopHave}>
                <span className={styles.shopLabel}>{c.have}</span>
                <input className={styles.have} type="number" inputMode="numeric" min={0} value={have[entry.item] ?? ""} placeholder="0" aria-label={`${c.have}: ${info?.name[lang] ?? entry.item}`}
                  onChange={(event) => { const value = Math.max(0, Math.floor(Number(event.target.value) || 0)); setHave((current) => ({ ...current, [entry.item]: value })); }} />
              </label>
              <span className={styles.shopCost}>
                {route.priced ? <span className={styles.shopLabel}>{c.cost}</span> : null}
                {route.priced ? cost ? <ProfessionMoney value={Math.round(cost.total)} lang={lang} /> : <span className={styles.muted}>{c.noPrice}</span> : null}
                {cost && cost.short > 0 ? <span className={styles.subNote}>{c.short} {(entry.qty - cost.short).toLocaleString(lang)}</span> : null}
              </span>
            </li>;
          })}
        </ul>
      </section>)}
      {route.priced ? <div className={styles.shopTotal}>
        {route.trainingCost > 0 ? <span className={styles.shopTotalPart}>{c.training} <ProfessionMoney value={route.trainingCost} lang={lang} /></span> : null}
        <span className={styles.shopTotalValue}>{c.total} <ProfessionMoney value={Math.round(total)} lang={lang} /></span>
      </div> : null}
    </MaterialPlaque> : null}

    {libraryOpen ? <LibraryHoverPreview rootId="profession-leveling" lang={lang} loadingLabel="…" /> : null}
  </div>;
}
