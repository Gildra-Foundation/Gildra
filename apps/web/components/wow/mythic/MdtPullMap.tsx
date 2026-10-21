"use client";

import { useMemo, useState } from "react";
import type { MdtNode as Node, MdtDataset } from "@/lib/data/wow/mythicReview.types";
import type { DungeonSlug } from "./dungeonRoutes";
import { mdtPullMapCopy } from "./mdtPullMapCopy";
import styles from "./mdtPullMap.module.css";


export default function MdtPullMap({ slug, locale, routeUrl, data }: { slug: DungeonSlug; locale: "ru" | "en"; routeUrl: string; data: MdtDataset }) {
  const copy = mdtPullMapCopy[locale];
  const initialPulls = data.route.pulls.length ? data.route.pulls : [[]];
  const [pulls, setPulls] = useState<string[][]>(initialPulls);
  const [edited, setEdited] = useState(false);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [floor, setFloor] = useState(1);
  const [message, setMessage] = useState("");
  const nodes = data.nodes;
  const floors = [...new Set(nodes.map(n => n.floor))];
  const used = useMemo(() => new Map(pulls.flatMap((pull, index) => pull.map(id => [id, index] as const))), [pulls]);
  const selected = nodes.filter(n => pulls[active]?.includes(n.id));
  const selectedForces = selected.reduce((sum, n) => sum + n.forces, 0);
  const totalForces = nodes.filter(n => used.has(n.id)).reduce((sum, n) => sum + n.forces, 0);
  const toggleGroup = (node: Node) => {
    // g is a linked spawn group, scoped to its floor. Never duplicate a clone.
    setEdited(true);
    const ids = nodes.filter(n => n.group === node.group && n.floor === node.floor).map(n => n.id);
    const remove = ids.every(id => pulls[active].includes(id));
    setPulls(previous => previous.map((pull, index) => index === active
      ? remove ? pull.filter(id => !ids.includes(id)) : [...new Set([...pull, ...ids])]
      : pull.filter(id => !ids.includes(id))));
  };
  const nextPull = () => { setEdited(true); setPulls(previous => [...previous, []]); setActive(pulls.length); };
  const exportRoute = () => {
    const payload = { format: "gildra-mdt-pull-plan-v1", dungeon: slug, source: data.source, sourceSha256: data.sha256, status: "user-plan-not-game-verified", pulls: pulls.filter(p => p.length).map(ids => ids.map(id => { const n=nodes.find(n=>n.id===id)!; return {clone:id,npcId:n.npcId}; })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"}));
    const a=document.createElement("a"); a.href=url; a.download=`${slug}-pulls.json`; a.click(); URL.revokeObjectURL(url);
    setMessage(copy.downloaded);
  };
  const enemySummary = [...new Set(selected.map(n=>n.name))].map(name => ({name, count:selected.filter(n=>n.name===name).length}));
  return <section className={styles.panel} data-testid="mdt-map" aria-label={copy.mapLabel}>
    <h3>{copy.title}</h3>
    <p data-testid="mdt-route-status">{data.route.status === "dataset-matched"
      ? `${copy.matched(data.route.author, data.route.name)} ${edited ? copy.edited : copy.authoredOrder}`
      : copy.incompatible(data.route.errors.join(", "))}</p>
    <p>{copy.instructions}</p>
    <p className={styles.notice}>{copy.notice}</p>
    <div className={styles.tools}>
      <button type="button" onClick={()=>setZoom(z=>Math.max(.75,z-.25))} aria-label={copy.zoomOut}>−</button>
      <output>{Math.round(zoom*100)}%</output>
      <button type="button" onClick={()=>setZoom(z=>Math.min(2,z+.25))} aria-label={copy.zoomIn}>+</button>
      {floors.length>1 && <select aria-label={copy.floorLabel} value={floor} onChange={e=>setFloor(Number(e.target.value))}>{floors.map(f=><option key={f} value={f}>{copy.floor} {f}</option>)}</select>}
      <a href={data.route.url || routeUrl} target="_blank" rel="noreferrer">{copy.authoredRoute}</a>
    </div>
    <label className={styles.tools}>{copy.selectWithoutMap}
      <select value="" onChange={e=>{const node=nodes.find(n=>n.id===e.target.value);if(node){setFloor(node.floor);toggleGroup(node);}}}>
        <option value="">{copy.chooseGroup}</option>
        {nodes.filter((n,i)=>nodes.findIndex(x=>x.group===n.group && x.floor===n.floor)===i).map(n=><option key={n.id} value={n.id}>#{n.group} · {n.name} · {nodes.filter(x=>x.group===n.group && x.floor===n.floor).length} {copy.enemies}</option>)}
      </select>
    </label>
    <div className={styles.viewport}>
      <div className={styles.map} style={{width:`${840*zoom}px`}}>
        {/* Original 15×10 MDT tiles; coordinates share the same 840×560 space. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.image} alt={copy.mapAlt} width={1680} height={1120} />
        <svg className={styles.orderLine} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={pulls.map(p=>nodes.filter(n=>p.includes(n.id) && n.floor===floor)).filter(p=>p.length).map(p=>`${p.reduce((s,n)=>s+n.x,0)/p.length},${p.reduce((s,n)=>s+n.y,0)/p.length}`).join(" ")} /></svg>
        {nodes.filter(n=>n.floor===floor).map(n=><button key={n.id} type="button" className={styles.enemy} style={{left:`${n.x}%`,top:`${n.y}%`}} data-boss={n.boss || undefined} data-selected={used.has(n.id) || undefined} aria-pressed={used.get(n.id)===active} aria-label={`${n.name} · ${copy.npc} ${n.npcId} · ${copy.clone} ${n.id} · ${n.forces}/${data.total}`} title={`${n.name} · ${n.forces}/${data.total} · #${n.group}`} onClick={()=>toggleGroup(n)}>{used.has(n.id) ? used.get(n.id)!+1 : n.boss ? copy.bossMarker : ""}</button>)}
      </div>
    </div>
    <div className={styles.tools}>
      <button type="button" onClick={nextPull} disabled={!pulls[active]?.length}>{copy.nextPull}</button>
      <button type="button" onClick={exportRoute} disabled={!used.size}>{copy.download}</button>
      <button type="button" onClick={()=>{setPulls([[]]);setActive(0);setEdited(true);}} disabled={!used.size && pulls.length===1}>{copy.reset}</button>
    </div>
    {data.route.pulls.length>0 && <button type="button" className={styles.restore} onClick={()=>{setPulls(initialPulls);setActive(0);setEdited(false);}}>{copy.restore}</button>}
    <ol className={styles.pulls}>{pulls.map((pull,i)=>{
      const members=nodes.filter(n=>pull.includes(n.id)); const forces=members.reduce((sum,n)=>sum+n.forces,0);
      return <li key={i}><button type="button" aria-pressed={active===i} onClick={()=>setActive(i)}>{copy.pull} {i+1} · {members.length} {copy.enemies} · {(forces/data.total*100).toFixed(2)}%</button></li>;
    })}</ol>
    <p><b>{copy.currentPull} {active+1}:</b> {enemySummary.length ? enemySummary.map(e=>`${e.count} × ${e.name}`).join("; ") : copy.selectOnMap} · {selectedForces}/{data.total}</p>
    <p><b>{copy.totalForces}: {(totalForces/data.total*100).toFixed(2)}%</b> ({totalForces}/{data.total}). {copy.forcesNotice}</p>
    {data.route.notes.length>0 && <details><summary>{copy.authorNotes}</summary><ul>{data.route.notes.map((n,i)=><li key={i}>{n[locale]}</li>)}</ul></details>}
    <p className={styles.source}><a href={data.source} target="_blank" rel="noreferrer">{copy.source}</a> · <time dateTime={data.checkedAt}>{data.checkedAt}</time></p>
    <p role="status">{message}</p>
  </section>;
}
