import { MapPin } from "lucide-react";
import { ProfessionItemLabel } from "./ProfessionParts";
import { professionIconUrl, treasureMacro, wayCommand } from "@/lib/wow/professions/leveling";
import type { KnowledgeSource, ProfessionData, ProfessionPlace } from "@/lib/wow/professions/types";
import { CopyCommand } from "./CopyCommand";
import { professionsCopy } from "./professionsCopy";
import styles from "./professions.module.css";

type Lang = "en" | "ru";

function Place({ place, lang, title }: { place: ProfessionPlace; lang: Lang; title?: string }) {
  const c = professionsCopy[lang];
  return <div className={styles.place}>
    {title ? <p className={styles.placeTitle}>{title}</p> : null}
    <p className={styles.placeName}>{place.name[lang]}</p>
    <p className={styles.placeZone}><MapPin size={14} aria-hidden="true" />{place.zone[lang]} · {place.x.toFixed(1)}, {place.y.toFixed(1)}</p>
    <CopyCommand text={wayCommand(place, place.name[lang])} copy={c.copy} copied={c.copied} failed={c.copyFailed} />
  </div>;
}

function SourceRow({ source, data, lang }: { source: KnowledgeSource; data: ProfessionData; lang: Lang }) {
  const c = professionsCopy[lang];
  return <tr>
    <th scope="row">
      <span className={styles.sourceItems}>
        {source.items.map((id) => {
          const item = data.items[id];
          return <ProfessionItemLabel key={id} lang={lang} name={item?.name[lang] ?? null} icon={professionIconUrl(item?.icon)} quality={item?.quality ?? null} rank={null} />;
        })}
      </span>
    </th>
    <td>{c.kindsKnowledge[source.kind]}{source.vendor ? <span className={styles.subNote}>{source.vendor.name[lang]} · {source.vendor.zone[lang]}</span> : null}</td>
    <td data-numeric>{source.items.length > 1 ? `${source.items.length} × ${source.points}` : source.points}</td>
    {source.vendor ? <td><CopyCommand text={wayCommand(source.vendor, source.vendor.name[lang])} copy={c.copy} copied={c.copied} failed={c.copyFailed} show={false} /></td> : <td />}
  </tr>;
}

/** Trainer, every knowledge source with its points, and the one-time treasures with waypoints and a check macro. */
export function ProfessionKnowledge({ data, lang }: { data: ProfessionData; lang: Lang }) {
  const c = professionsCopy[lang];
  const { weekly, oneTime, treasures } = data.knowledge;
  const ways = treasures.map((t) => wayCommand(t, data.items[t.item]?.name[lang] ?? "")).join("\n");
  const sources = [...weekly.map((s) => ({ s, group: c.weekly })), ...oneTime.map((s) => ({ s, group: c.oneTime }))];
  return <div className={styles.knowledge}>
    <Place place={data.trainer} lang={lang} title={c.trainer} />
    {sources.length ? <div className={styles.tableScroll} role="group" aria-label={c.knowledge} tabIndex={0}>
      <table className={styles.table}>
        <thead><tr><th scope="col">{c.knowledge}</th><th scope="col">{c.source}</th><th scope="col" data-numeric>{c.points}</th><th scope="col"><span className={styles.visuallyHidden}>{c.coords}</span></th></tr></thead>
        {[c.weekly, c.oneTime].map((group) => {
          const rows = sources.filter((x) => x.group === group);
          return rows.length ? <tbody key={group}>
            <tr className={styles.groupRow}><th scope="rowgroup" colSpan={4}>{group}</th></tr>
            {rows.map(({ s }) => <SourceRow key={s.items.join("-")} source={s} data={data} lang={lang} />)}
          </tbody> : null;
        })}
      </table>
    </div> : null}

    {treasures.length ? <>
      <h3 className={styles.subTitle}>{c.treasures}</h3>
      <div className={styles.tableScroll} role="group" aria-label={c.treasuresLabel} tabIndex={0}>
        <table className={styles.table}>
          <thead><tr><th scope="col" data-numeric>#</th><th scope="col">{c.treasures}</th><th scope="col">{c.zone}</th><th scope="col" data-numeric>{c.points}</th><th scope="col">{c.coords}</th></tr></thead>
          <tbody>
            {treasures.map((t, index) => {
              const item = data.items[t.item];
              return <tr key={t.quest}>
                <td data-numeric>{index + 1}</td>
                <th scope="row"><ProfessionItemLabel lang={lang} name={item?.name[lang] ?? null} icon={professionIconUrl(item?.icon)} quality={item?.quality ?? null} rank={null} /></th>
                <td>{t.zone[lang]}</td>
                <td data-numeric>{t.points}</td>
                <td><CopyCommand text={wayCommand(t, item?.name[lang] ?? "")} copy={c.copy} copied={c.copied} failed={c.copyFailed} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.macros}>
        <CopyCommand text={ways} copy={c.copy} copied={c.copied} failed={c.copyFailed} label={c.copyAll} show={false} />
        <div className={styles.macro}>
          <p className={styles.fieldLabel}>{c.macro}</p>
          <CopyCommand text={treasureMacro(treasures.map((t) => t.quest), { done: c.done, missing: c.missing })} copy={c.copy} copied={c.copied} failed={c.copyFailed} />
        </div>
      </div>
    </> : null}
  </div>;
}
