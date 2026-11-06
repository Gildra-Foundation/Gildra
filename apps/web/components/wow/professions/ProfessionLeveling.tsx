"use client";
import { useMemo, useState } from "react";
import { ProfessionIcon, ProfessionItemLabel, ProfessionMoney } from "./ProfessionParts";
import { buyCost, DEFAULT_ROUTE_SOURCES, planRoute, professionIconUrl, ROUTE_SOURCES, shoppingList } from "@/lib/wow/professions/leveling";
import type { ProfessionItem, ProfessionPrices, ProfessionRecipe, RecipeSource } from "@/lib/wow/professions/types";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";

type Props = { lang: "en" | "ru"; recipes: ProfessionRecipe[]; items: Record<string, ProfessionItem>; prices: ProfessionPrices; maxSkill: number };

/** Reagent as a small icon with its count; the name is in the accessible label and the shopping list. */
function Reagent({ item, qty, items, lang }: { item: number; qty: number; items: Props["items"]; lang: Props["lang"] }) {
  const info = items[item], name = info?.name[lang] ?? String(item);
  return <span className={styles.reagent} title={`${name} ×${qty}`} aria-label={`${name} ×${qty}`} role="img">
    <ProfessionIcon url={professionIconUrl(info?.icon)} size={28} /><span aria-hidden="true">{qty}</span>
  </span>;
}

/** Cheapest leveling route at current prices, recomputed as the player changes the start, recipe sources and stock. */
export function ProfessionLeveling({ lang, recipes, items, prices, maxSkill }: Props) {
  const c = professionsCopy[lang];
  const available = useMemo(() => ROUTE_SOURCES.filter((source) => recipes.some((recipe) => recipe.source === source)), [recipes]);
  const [from, setFrom] = useState(1);
  const [sources, setSources] = useState<RecipeSource[]>(() => available.filter((source) => DEFAULT_ROUTE_SOURCES.includes(source)));
  const [have, setHave] = useState<Record<number, number>>({});
  const route = useMemo(() => planRoute(recipes, items, prices, { from, to: maxSkill, sources }), [recipes, items, prices, from, maxSkill, sources]);
  const list = useMemo(() => shoppingList(route.steps, items, prices), [route, items, prices]);
  const costs = list.map((entry) => buyCost(entry, entry.qty - (have[entry.item] ?? 0), items, prices));
  const total = costs.reduce((sum, cost) => sum + (cost?.total ?? 0), 0) + route.trainingCost;
  const toggle = (source: RecipeSource) => setSources((current) => current.includes(source) ? current.filter((s) => s !== source) : [...current, source]);

  return <div className={styles.leveling}>
    <div className={styles.controls}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{c.from}</span>
        <input className={styles.number} type="number" inputMode="numeric" min={1} max={maxSkill - 1} value={from}
          onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setFrom(Math.min(maxSkill - 1, Math.max(1, Math.floor(value)))); }} />
      </label>
      <fieldset className={styles.sources}>
        <legend className={styles.fieldLabel}>{c.recipesFrom}</legend>
        <div className={styles.chips}>
          {available.map((source) => <label key={source} className={styles.chip}>
            <input type="checkbox" checked={sources.includes(source)} onChange={() => toggle(source)} />
            <span>{c.sources[source]}</span>
          </label>)}
        </div>
      </fieldset>
    </div>

    {!route.priced ? <p className={styles.notice} role="status">{c.noPrices}</p> : null}
    {route.steps.length === 0 ? <p className={styles.notice} role="status">{c.noRoute}</p> : <>
      <div className={styles.tableScroll} role="group" aria-label={c.stepsLabel} tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">{c.skill}</th><th scope="col">{c.recipe}</th><th scope="col" data-numeric>{c.crafts}</th><th scope="col">{c.reagents}</th>{route.priced ? <th scope="col" data-numeric>{c.cost}</th> : null}</tr></thead>
          <tbody>
            {route.steps.map((step) => <tr key={`${step.from}-${step.recipe.id}`}>
              <td className={styles.skillCell}>{step.from}–{step.to}</td>
              <th scope="row" className={styles.recipeCell}>
                <span className={styles.recipeName}>{step.recipe.name[lang]}</span>
                {step.recipe.source !== "start" ? <span className={styles.sourceTag}>{c.sources[step.recipe.source]}</span> : null}
              </th>
              <td data-numeric>×{step.crafts}</td>
              <td><span className={styles.reagents}>{step.recipe.reagents.map(([item, qty]) => <Reagent key={item} item={item} qty={qty * step.crafts} items={items} lang={lang} />)}</span></td>
              {route.priced ? <td data-numeric><ProfessionMoney value={step.cost === null ? null : Math.round(step.cost)} lang={lang} /></td> : null}
            </tr>)}
          </tbody>
        </table>
      </div>
      {route.reached < maxSkill ? <p className={styles.notice} role="status">{c.reachedOnly(route.reached)}</p> : null}

      <h3 className={styles.subTitle}>{c.shopping}</h3>
      <div className={styles.tableScroll} role="group" aria-label={c.shoppingLabel} tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col">{c.item}</th><th scope="col" data-numeric>{c.need}</th><th scope="col" data-numeric>{c.have}</th>{route.priced ? <th scope="col" data-numeric>{c.cost}</th> : null}</tr></thead>
          <tbody>
            {list.map((entry, index) => {
              const info = items[entry.item], cost = costs[index];
              return <tr key={entry.item}>
                <th scope="row"><ProfessionItemLabel lang={lang} name={info?.name[lang] ?? null} icon={professionIconUrl(info?.icon)} quality={info?.quality ?? null} rank={info?.ranks && entry.buy && !entry.buy.vendor ? entry.buy.rank : null} /></th>
                <td data-numeric>{entry.qty.toLocaleString(lang)}</td>
                <td data-numeric>
                  <input className={styles.have} type="number" inputMode="numeric" min={0} value={have[entry.item] ?? ""} placeholder="0" aria-label={`${c.have}: ${info?.name[lang] ?? entry.item}`}
                    onChange={(event) => { const value = Math.max(0, Math.floor(Number(event.target.value) || 0)); setHave((current) => ({ ...current, [entry.item]: value })); }} />
                </td>
                {route.priced ? <td data-numeric>
                  {cost ? <ProfessionMoney value={Math.round(cost.total)} lang={lang} /> : <span className={styles.muted}>{c.noPrice}</span>}
                  {entry.buy?.vendor ? <span className={styles.subNote}>{c.vendor}</span> : null}
                  {cost && cost.short > 0 ? <span className={styles.subNote}>{c.short} {(entry.qty - cost.short).toLocaleString(lang)}</span> : null}
                </td> : null}
              </tr>;
            })}
          </tbody>
          {route.priced ? <tfoot>
            {route.trainingCost > 0 ? <tr><th scope="row" colSpan={3}>{c.training}</th><td data-numeric><ProfessionMoney value={route.trainingCost} lang={lang} /></td></tr> : null}
            <tr className={styles.totalRow}><th scope="row" colSpan={3}>{c.total}</th><td data-numeric><ProfessionMoney value={Math.round(total)} lang={lang} /></td></tr>
          </tfoot> : null}
        </table>
      </div>
    </>}
  </div>;
}
