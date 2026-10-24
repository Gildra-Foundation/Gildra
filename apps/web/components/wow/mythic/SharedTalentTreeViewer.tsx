"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { ResilientImage } from "@/components/media/ResilientImage";
import { getTalentSpecThemeById } from "@/lib/talentSpecThemes";
import { projectSharedTalentTree, type SharedTalentTreeData, type ViewedTalentNode, type ViewedTalentTrees } from "@/lib/wow/sharedTalentTree";
import type { TalentKind } from "@/lib/talentCalculatorData";
import { decodeMythicTalentTree } from "./mythicTalentImport";
import { sharedTalentTreeCopy } from "./sharedTalentTreeCopy";
import styles from "./sharedTalentTree.module.css";

type Locale = "ru" | "en";
type Loaded = { state: "ready"; data: SharedTalentTreeData; trees: ViewedTalentTrees } | { state: "loading" | "failed" | "mismatch" };
const kinds: TalentKind[] = ["class", "spec", "hero"];
function nodeName(view: ViewedTalentNode) { return view.node.nodeType === "tiered" ? view.node.choices[0]?.name : view.node.choices[view.selection?.choiceIndex ?? 0]?.name; }

function TalentInspection({ view, locale, id }: { view: ViewedTalentNode; locale: Locale; id: string }) {
  const t = sharedTalentTreeCopy[locale], { node, selection } = view;
  return <aside id={id} className={styles.inspection} aria-live="polite" data-testid="shared-talent-inspection">
    <h3>{nodeName(view)}</h3><p><b>{selection ? t.selected : t.unselected}</b> · {t.rank} {selection?.rank ?? 0}/{node.maxRanks}{selection?.granted ? ` · ${t.granted}` : ""}</p>
    {node.choices.map((choice, index) => {
      const before = node.choices.slice(0, index).reduce((sum, entry) => sum + entry.maxRanks, 0);
      const rank = node.nodeType === "tiered" ? Math.max(0, Math.min(choice.maxRanks, (selection?.rank ?? 0) - before)) : selection?.choiceIndex === index ? selection.rank : 0;
      return <div className={styles.choice} key={choice.externalId} data-choice-selected={rank > 0}>
        <b>{rank > 0 ? "✓ " : ""}{choice.name}{node.nodeType === "tiered" ? ` · ${t.rank} ${rank}/${choice.maxRanks}` : ""}</b>
        <TalentDescription talent={choice} locale={locale} />
      </div>;
    })}
  </aside>;
}

function TalentBranch({ views, locale }: { views: ViewedTalentNode[]; locale: Locale }) {
  const t = sharedTalentTreeCopy[locale];
  const [inspected, setInspected] = useState<number>();
  const inspectionId = useId();
  function inspect(nodeId: number, reveal = false) {
    setInspected(nodeId);
    if (reveal && window.matchMedia("(max-width: 800px)").matches) requestAnimationFrame(() => document.getElementById(inspectionId)?.scrollIntoView({ block: "nearest", behavior: "instant" }));
  }
  const current = views.find(view => view.node.nodeId === inspected) ?? views.find(view => view.selection) ?? views[0];
  const height = Math.max(520, (Math.max(0, ...views.map(view => view.node.row)) + 1) * 68);
  const byId = new Map(views.map(view => [view.node.nodeId, view]));
  if (!current) return <p>{t.noTalents}</p>;
  return <>
    <div className={styles.branchLayout}>
      <div><p className={styles.pan}>{t.pan}</p><div className={styles.viewport} role="region" aria-label={t.tree} tabIndex={0}>
        <div className={styles.canvas} style={{ height }} data-testid="shared-talent-canvas">
          <svg className={styles.edges} viewBox={`0 0 680 ${height}`} preserveAspectRatio="none" aria-hidden="true">{views.flatMap(view => view.node.nextNodeIds.map(id => {
            const next = byId.get(id); if (!next) return null;
            return <line key={`${view.node.nodeId}-${id}`} x1={view.node.x * 6.8} y1={view.node.y * height / 100} x2={next.node.x * 6.8} y2={next.node.y * height / 100} data-selected={Boolean(view.selection && next.selection)} />;
          }))}</svg>
          {views.map(view => {
            const { node, selection } = view, choice = node.choices[selection?.choiceIndex ?? 0];
            return <button type="button" key={node.nodeId} className={styles.node} style={{ left: `${node.x}%`, top: `${node.y}%` } as CSSProperties} onClick={() => inspect(node.nodeId, true)} onFocus={() => inspect(node.nodeId)} data-tree-node={node.nodeId} data-selected={Boolean(selection)} data-rank={selection?.rank ?? 0} data-choice={selection?.choiceIndex ?? 0} aria-current={current.node.nodeId === node.nodeId ? "true" : undefined} aria-label={`${nodeName(view)} · ${selection ? t.selected : t.unselected} · ${t.rank} ${selection?.rank ?? 0}/${node.maxRanks}`}>
              <ResilientImage src={choice?.iconUrl} width={40} height={40} alt="" fallback={<span>◆</span>} /><span className={styles.rank}>{selection ? "✓ " : ""}{selection?.rank ?? 0}/{node.maxRanks}</span>
            </button>;
          })}
        </div>
      </div></div>
      <TalentInspection id={inspectionId} view={current} locale={locale} />
    </div>
    <details className={styles.selectedList}><summary>{t.chosen} ({views.filter(view => view.selection).length})</summary><ul>{views.filter(view => view.selection).map(view => <li key={view.node.nodeId}><button type="button" onClick={() => inspect(view.node.nodeId, true)}>{nodeName(view)} · {view.selection?.rank}/{view.node.maxRanks}</button></li>)}</ul></details>
  </>;
}

function LoadedTree({ value, locale }: { value: Extract<Loaded, { state: "ready" }>; locale: Locale }) {
  const t = sharedTalentTreeCopy[locale], [kind, setKind] = useState<TalentKind>("class");
  const { data, trees } = value;
  return <>
    <AtlasSegmented aria-label={t.tree} value={kind} onValueChange={value => setKind(value as TalentKind)} options={kinds.map(key => ({ value: key, label: `${t[key]} · ${trees[key].filter(view => view.selection).reduce((sum, view) => sum + (view.selection?.granted ? 0 : view.selection?.rank ?? 0), 0)}` }))} />
    <p>{kind === "hero" && trees.hero.length ? data.heroName : t[kind]}</p>
    {kind === "hero" && !trees.hero.length ? <p>{t.noHero}</p> : <TalentBranch key={kind} views={trees[kind]} locale={locale} />}
    <p className={styles.source}>{t.source}: <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.label}</a> · {data.buildVersion}</p>
  </>;
}

export function SharedTalentTreeViewer({ code, locale, onClose }: { code: string; locale: Locale; onClose: () => void }) {
  const t = sharedTalentTreeCopy[locale], decoded = useMemo(() => decodeMythicTalentTree(code), [code]);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" }), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const spec = decoded.ok ? getTalentSpecThemeById(decoded.specId) : undefined;
    if (!decoded.ok || !spec) return;
    const hero = decoded.heroSubtreeId || spec.heroPaths[0].id;
    const timer = window.setTimeout(() => { controller.abort(); setLoaded({ state: "failed" }); }, 25_000);
    void fetch(`/api/wow/shared-talent-tree?${new URLSearchParams({ spec: String(decoded.specId), hero: String(hero), lang: locale })}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Tree unavailable");
      const data = await response.json() as SharedTalentTreeData;
      if (controller.signal.aborted) return;
      try { setLoaded({ state: "ready", data, trees: projectSharedTalentTree(data, code) }); }
      catch { setLoaded({ state: "mismatch" }); }
    }).catch(() => { if (!controller.signal.aborted) setLoaded({ state: "failed" }); }).finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [code, decoded, locale, attempt]);
  return <AtlasDialog open onClose={onClose} label={t.title} className={styles.dialog} variant="sheet">
    <header className={styles.header}><h2>{t.title}</h2><AtlasButton variant="ghost" onClick={onClose}>{t.close}</AtlasButton></header>
    <div className={styles.body} data-testid="shared-talent-tree"><p>{t.hint}</p>
      {loaded.state === "loading" ? <p role="status">{t.loading}</p> : loaded.state === "ready" ? <LoadedTree value={loaded} locale={locale} /> : <div role="alert"><p>{loaded.state === "mismatch" ? t.mismatch : t.failed}</p><AtlasButton onClick={() => { setLoaded({ state: "loading" }); setAttempt(value => value + 1); }}>{t.retry}</AtlasButton></div>}
    </div>
  </AtlasDialog>;
}
