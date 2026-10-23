"use client";

import type { MdtNode, MdtDataset } from "@/lib/data/wow/mythicReview.types";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { mdtPullMapCopy } from "./mdtPullMapCopy";
import styles from "./mdtPullMap.module.css";

export default function MdtPullMap({ locale, routeUrl, data }: { slug: DungeonSlug; locale: "ru" | "en"; routeUrl: string; data: MdtDataset }) {
  const copy = mdtPullMapCopy[locale];
  const authored = data.route.status === "dataset-matched" && data.route.pulls.length > 0;
  const nodesById = new Map(data.nodes.map(node => [node.id, node]));
  // An incompatible import must never be presented as an authored route.
  const spawnGroups = new Map<string, MdtNode[]>();
  if (!authored) for (const node of data.nodes) {
    const key = `${node.floor}:${node.group}`;
    spawnGroups.set(key, [...(spawnGroups.get(key) ?? []), node]);
  }
  const pulls = (authored
    ? data.route.pulls.map(ids => ids.flatMap(id => nodesById.has(id) ? [nodesById.get(id)!] : []))
    : [...spawnGroups.values()]).filter(members => members.length > 0);
  const floors = [...new Set(data.nodes.map(node => node.floor))].sort((a, b) => a - b);
  const uniqueMembers = new Map(pulls.flat().map(node => [node.id, node]));
  const totalForces = [...uniqueMembers.values()].reduce((sum, node) => sum + node.forces, 0);
  const forcesPercent = (forces: number) => data.total > 0 ? `${(forces / data.total * 100).toFixed(2)}%` : "—";
  const label = authored ? copy.pull : copy.group;

  return <section className={styles.panel} data-testid="mdt-map" aria-label={copy.mapLabel}>
    <header className={styles.header}>
      <div><h3>{copy.title}</h3><p className={styles.intro}>{copy.instructions}</p></div>
      <a className={styles.routeLink} href={data.route.url || routeUrl} target="_blank" rel="noreferrer">{copy.authoredRoute}</a>
    </header>
    <p className={styles.routeStatus} data-testid="mdt-route-status">{authored ? copy.matched(data.route.author, data.route.name) : copy.incompatible}</p>
    {pulls.length === 0 ? <p role="status">{copy.empty}</p> : <>
      <div className={styles.legend}><span><b>5</b> {copy.legend}</span><span>{authored ? copy.numberLegend : copy.groupLegend}</span></div>
      {floors.map(floor => <figure className={styles.floor} key={floor}>
        {floors.length > 1 && <figcaption>{copy.floor} {floor}</figcaption>}
        <div className={styles.viewport} tabIndex={0} role="region" aria-label={`${copy.mapLabel} · ${copy.floor} ${floor}`}>
          <div className={styles.map}>
            {/* Original MDT tiles and coordinates share the same 3:2 space. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.image} alt={copy.mapAlt} width={1680} height={1120} />
            {pulls.map((members, index) => {
              const local = members.filter(node => node.floor === floor);
              if (!local.length) return null;
              const x = local.reduce((sum, node) => sum + node.x, 0) / local.length;
              const y = local.reduce((sum, node) => sum + node.y, 0) / local.length;
              const bossOnly = local.every(node => node.boss);
              return <div key={members.map(node => node.id).join(",")} className={styles.marker} data-testid="mdt-pull-marker" data-boss={bossOnly || undefined}
                style={{ left: `${x}%`, top: `${y}%` }} role="img"
                aria-label={`${label} ${index + 1}: ${copy.enemyCount(local.length)}${bossOnly ? ` · ${copy.boss}` : ""}`}>
                <span className={styles.markerNumber} aria-hidden="true">№{index + 1}</span>
                <strong aria-hidden="true">{local.length}</strong>
              </div>;
            })}
          </div>
        </div>
      </figure>)}
      <p className={styles.mapHint}>{copy.mapHint}</p>
      <div className={styles.summary}><h4>{authored ? copy.composition : copy.groupComposition}</h4><span>{copy.totalForces}: <b>{forcesPercent(totalForces)}</b></span></div>
      <ol className={styles.pulls}>{pulls.map((members, index) => {
        const enemies = new Map<string, number>();
        for (const node of members) enemies.set(node.name, (enemies.get(node.name) ?? 0) + 1);
        const forces = members.reduce((sum, node) => sum + node.forces, 0);
        return <li className={styles.pull} key={members.map(node => node.id).join(",")}>
          <span className={styles.pullNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.pullBody}>
            <div className={styles.pullHeading}><h5>{label} {index + 1}</h5><span>{copy.enemyCount(members.length)} · {forcesPercent(forces)}</span></div>
            <p>{[...enemies].map(([name, count]) => `${count} × ${name}`).join(" · ")}</p>
          </div>
        </li>;
      })}</ol>
    </>}
    <details className={styles.details}><summary>{copy.details}</summary>
      <p>{copy.notice}</p><p>{copy.forcesNotice}</p>
      {data.route.notes.length > 0 && <><h4>{copy.authorNotes}</h4><ul>{data.route.notes.map(note => <li key={note.en}>{note[locale]}</li>)}</ul></>}
      <p className={styles.source}><a href={data.source} target="_blank" rel="noreferrer">{copy.source}</a> · <time dateTime={data.checkedAt}>{data.checkedAt}</time></p>
    </details>
  </section>;
}
