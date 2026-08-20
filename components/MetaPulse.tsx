import Link from "next/link";
import { SpecSlot } from "./SpecSlot";
import { tierTable } from "@/data/site";
import { p, t, type Lang } from "@/lib/i18n";

/** Фирменный Meta Pulse: движения меты из реального датасета
 *  (trend-поля тир-таблицы), без выдуманных причин и «live»-обещаний. */
export function MetaPulse({ lang = "en" }: { lang?: Lang }) {
  const tt = t(lang);
  const movers = tierTable
    .flatMap((g) => g.rows)
    .filter((r) => r.trend.dir !== "flat")
    .sort((a, b) => (b.trend.val ?? 0) - (a.trend.val ?? 0));
  const top = [
    ...movers.filter((m) => m.trend.dir === "up").slice(0, 2),
    ...movers.filter((m) => m.trend.dir === "down").slice(0, 1),
  ];
  const short = (n: string) =>
    n.replace("Death Knight", "DK").replace("Demon Hunter", "DH");

  return (
    <aside className="mpulse" aria-label="Meta pulse">
      <span className="pulse-tag">
        <b>Meta Pulse</b>
        <span>{tt("Season 1 · demo data")}</span>
      </span>
      <div className="pulse-movers">
        {top.map((m) => (
          <span className="pmove" key={m.spec.name}>
            <SpecSlot name={m.spec.name} cls={m.spec.cls} size="sm" />
            <span className="pmove-name">{short(m.spec.name)}</span>
            <b className={m.trend.dir}>
              {m.trend.dir === "up" ? "▲" : "▼"}
              {m.trend.val}
            </b>
          </span>
        ))}
      </div>
      <Link className="pulse-link" href={p(lang, "/tier-lists")}>
        {movers.length} {tt("rank changes")} →
      </Link>
    </aside>
  );
}
