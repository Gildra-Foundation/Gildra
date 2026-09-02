import Link from "next/link";
import { SpecSlot } from "@/components/SpecSlot";
import { p, t } from "@/lib/i18n";
import type { BlockComponentProps } from "@/lib/blocks/types";
import type { MetaPulseData, MetaPulseProps } from "./schema";

/** Фирменный Meta Pulse: движения меты из реального датасета
 *  (trend-поля тир-таблицы), без выдуманных причин и «live»-обещаний. */
export function MetaPulse({ data, lang }: BlockComponentProps<MetaPulseProps, MetaPulseData>) {
  const tt = t(lang);
  const short = (n: string) =>
    n.replace("Death Knight", "DK").replace("Demon Hunter", "DH");

  return (
    <aside className="mpulse" aria-label="Meta pulse">
      <span className="pulse-tag">
        <b>Meta Pulse</b>
        <span>{tt("Season 1 · demo data")}</span>
      </span>
      <div className="pulse-movers">
        {data.top.map((m) => (
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
        {data.changes} {tt("rank changes")} →
      </Link>
    </aside>
  );
}
