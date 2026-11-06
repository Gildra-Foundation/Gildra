"use client";
import { useMemo, useState } from "react";
import { ProfessionItemLabel, ProfessionMoney } from "./ProfessionParts";
import { profitRows, professionIconUrl } from "@/lib/wow/professions/leveling";
import type { ProfessionItem, ProfessionPrices, ProfessionRecipe } from "@/lib/wow/professions/types";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";

const FIRST = 12;

/** Crafts whose product sells for more than its reagents, best first. */
export function ProfessionProfits({ lang, recipes, items, prices }: { lang: "en" | "ru"; recipes: ProfessionRecipe[]; items: Record<string, ProfessionItem>; prices: ProfessionPrices }) {
  const c = professionsCopy[lang];
  const rows = useMemo(() => profitRows(recipes, items, prices).filter((row) => row.margin > 0), [recipes, items, prices]);
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className={styles.notice}>{c.noProfit}</p>;
  const shown = all ? rows : rows.slice(0, FIRST);
  return <>
    <div className={styles.tableScroll} role="group" aria-label={c.profitLabel} tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">{c.recipe}</th><th scope="col" data-numeric>{c.cost}</th><th scope="col" data-numeric>{c.sale}</th><th scope="col" data-numeric>{c.median}</th><th scope="col" data-numeric>{c.margin}</th></tr></thead>
        <tbody>
          {shown.map((row) => {
            const product = items[row.recipe.output!.item];
            const rank = row.recipe.output?.ranks ? row.recipe.output.ranks.indexOf(row.output) + 1 : null;
            return <tr key={row.recipe.id}>
              <th scope="row">
                <ProfessionItemLabel lang={lang} name={row.recipe.name[lang]} icon={professionIconUrl(product?.icon)} quality={product?.quality ?? null} rank={rank} />
                {row.recipe.output!.qty > 1 ? <span className={styles.subNote}>×{row.recipe.output!.qty}</span> : null}
              </th>
              <td data-numeric><ProfessionMoney value={Math.round(row.cost)} lang={lang} /></td>
              <td data-numeric><ProfessionMoney value={row.sale} lang={lang} /></td>
              <td data-numeric><ProfessionMoney value={row.median} lang={lang} /></td>
              <td data-numeric className={styles.profit}><ProfessionMoney value={Math.round(row.margin)} lang={lang} /></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <div className={styles.tableFoot}>
      <span className={styles.muted}>{c.margin}: {c.perCraft}</span>
      {rows.length > FIRST ? <button type="button" className={styles.textButton} onClick={() => setAll(!all)} aria-expanded={all}>{all ? c.showLess : c.showAll(rows.length)}</button> : null}
    </div>
  </>;
}
