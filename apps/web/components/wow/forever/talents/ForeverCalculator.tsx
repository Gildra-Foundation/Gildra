"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Copy, RotateCcw, Undo2 } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasSegmented } from "@gildra/atlas-ui/AtlasSegmented";
import { ForeverFilters, ForeverSelect } from "@/components/wow/forever/shared/ForeverFilters";
import { changeRank, decodeBuild, emptyBuild, encodeBuild, gatePoints, pointBudget, requiredLevel, spentPoints, treePoints, validateBuild } from "@/lib/forever/talents/engine";
import { foreverTalentIcon } from "@/lib/forever/talents/links";
import type { BuildError, TalentBuild, TalentClass, TalentNode, TalentTree as Tree } from "@/lib/forever/talents/types";
import { notifyForeverNavigation } from "@/lib/forever/navigation";
import { TalentDetail } from "./TalentDetail";
import { TalentTree } from "./TalentTree";
import { treeKey } from "./talentArt";
import { talentCopy } from "./talentCopy";
import styles from "./talents.module.css";

type Props = { cls: TalentClass; snapshot: string; lang: "en" | "ru"; initial: TalentBuild; initialError: BuildError | null };
const touchQuery = "(pointer: coarse)";
function subscribeTouch(callback: () => void) {
  const media = window.matchMedia(touchQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const touchSnapshot = () => window.matchMedia(touchQuery).matches;
const serverTouch = () => false;
const levels = Array.from({ length: 60 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));
const legacyRanks = [0, 1, 2, 3, 4, 5].map(rank => ({ value: rank, label: `${rank}/5` }));

/**
 * The calculator on the section's panel: level and points, the three trees and the chosen talent.
 * Wide screens show the trees side by side; narrower ones show one tree under a switch (the same markup,
 * the split is CSS), and on a phone the talent panel docks to the bottom of the screen under the tree.
 */
export function ForeverCalculator({ cls, snapshot, lang, initial, initialError }: Props) {
  const t = talentCopy[lang];
  const touch = useSyncExternalStore(subscribeTouch, touchSnapshot, serverTouch);
  const [build, setBuild] = useState(initial);
  const [error, setError] = useState(initialError);
  const [history, setHistory] = useState<TalentBuild[]>([]);
  const [shown, setShown] = useState({ tree: cls.trees[0], node: cls.trees[0].nodes[0] });
  const [activeTree, setActiveTree] = useState(String(cls.trees[0].id));
  const [focusNodes, setFocusNodes] = useState<Record<number, number>>({});
  // What the status line says; `quiet` is for a screen reader only (the trees already show it).
  const [status, setStatus] = useState({ text: "", quiet: false });
  const setMessage = (text: string, quiet = false) => setStatus({ text, quiet });
  const [pulse, setPulse] = useState<{ id: number | null; n: number } | null>(null);
  const spent = spentPoints(build.ranks);
  const budget = Math.min(cls.maxPoints, pointBudget(build.level, build.talented));
  const beat = (id: number | null) => setPulse(current => ({ id, n: (current?.n ?? 0) + 1 }));

  function sync(next: TalentBuild) {
    const url = new URL(window.location.href);
    url.searchParams.set("build", encodeBuild(cls, snapshot, next));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    notifyForeverNavigation();
  }
  function commit(next: TalentBuild, announcement = "", changed: number | null = null) {
    setHistory(items => [...items.slice(-99), build]);
    setBuild(next); setError(null); setMessage(announcement, true); sync(next); beat(changed);
  }
  function edit(node: TalentNode, delta: 1 | -1) {
    const next = changeRank(cls, build, node.id, delta);
    if (next) commit(next, `${node.name[lang]} ${(next.ranks[node.id] ?? 0)}/${node.maxRanks} · ${t.remaining}: ${pointBudget(next.level, next.talented) - spentPoints(next.ranks)}`, node.id);
    else setMessage(t.unavailable);
  }
  function setLevel(field: "level" | "talented", value: number) {
    const next = { ...build, [field]: value };
    if (validateBuild(cls, next)) setMessage(t.levelConflict); else commit(next);
  }
  function resetTree(tree: Tree) {
    const ranks = { ...build.ranks };
    tree.nodes.forEach(node => delete ranks[node.id]);
    commit({ ...build, ranks });
  }
  function undo() {
    const previous = history[history.length - 1];
    setHistory(items => items.slice(0, -1)); setBuild(previous); setMessage(""); sync(previous); beat(null);
  }
  async function share() {
    sync(build);
    try { await navigator.clipboard.writeText(window.location.href); setMessage(t.copied); }
    catch { setMessage(t.copyFailed); }
  }

  useEffect(() => {
    const selectHash = () => {
      const tree = cls.trees.find(item => `#tree-${treeKey(item)}` === window.location.hash);
      if (tree) { setActiveTree(String(tree.id)); setShown({ tree, node: tree.nodes[0] }); }
    };
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const result = decodeBuild(cls, snapshot, params.getAll("build").length > 1 ? "invalid" : params.get("build"));
      setBuild(result.build); setError(result.error); setHistory([]); setMessage(""); selectHash();
    };
    selectHash();
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", selectHash);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", selectHash); };
  }, [cls, snapshot]);

  function requirementText(tree: Tree, node: TalentNode) {
    const lines: string[] = [];
    if (node.gate.points && gatePoints(tree, node, build.ranks) < node.gate.points)
      lines.push(`${node.gate.points} ${node.gate.nodeIds ? t.gatePoints : t.treePoints} (${tree.name[lang]})`);
    if (build.level + build.talented < node.level) lines.push(`${t.level} ${Math.max(1,node.level - build.talented)}`);
    const alternatives = node.prerequisites.filter(pre => !pre.required);
    const name = (pre: TalentNode["prerequisites"][number]) => `${tree.nodes.find(n => n.id === pre.nodeId)!.name[lang]} ${pre.ranks}/${pre.ranks}`;
    node.prerequisites.filter(pre => pre.required && (build.ranks[pre.nodeId] ?? 0) < pre.ranks).forEach(pre => lines.push(name(pre)));
    if (alternatives.length && !alternatives.some(pre => (build.ranks[pre.nodeId] ?? 0) >= pre.ranks)) lines.push(alternatives.map(name).join(` ${t.or} `));
    return lines;
  }

  function focusNode(tree: Tree, node: TalentNode) {
    setFocusNodes(current => ({ ...current, [tree.id]: node.id })); setActiveTree(String(tree.id)); setShown({ tree, node });
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-node="${node.id}"]`)?.focus());
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, tree: Tree, node: TalentNode) {
    let next: TalentNode | undefined;
    if (["+", "=", "-", "Backspace", "Delete"].includes(event.key)) {
      event.preventDefault(); edit(node, event.key === "+" || event.key === "=" ? 1 : -1); return;
    }
    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const index = (cls.trees.indexOf(tree) + (event.key === "PageDown" ? 1 : 2)) % 3;
      focusNode(cls.trees[index], cls.trees[index].nodes[0]); return;
    }
    const row = tree.nodes.filter(n => n.row === node.row).sort((a,b) => a.column-b.column);
    const column = tree.nodes.filter(n => n.column === node.column).sort((a,b) => a.row-b.row);
    const move = (items: TalentNode[], step: number) => items[(items.indexOf(node) + step + items.length) % items.length];
    if (event.key === "ArrowRight") next = move(row, 1);
    if (event.key === "ArrowLeft") next = move(row, -1);
    if (event.key === "ArrowDown") next = move(column, 1);
    if (event.key === "ArrowUp") next = move(column, -1);
    if (event.key === "Home") next = row[0];
    if (event.key === "End") next = row[row.length - 1];
    if (next) { event.preventDefault(); focusNode(tree,next); }
  }

  const openTree = (id: string) => {
    const tree = cls.trees.find(item => String(item.id) === id)!;
    setActiveTree(id); setShown({ tree, node: tree.nodes.find(node => node.id === focusNodes[tree.id]) ?? tree.nodes[0] });
  };

  return <>
    {error && <div className={styles.invalid}><p role="alert">{error === "snapshot" ? t.stale : t.invalid}</p><AtlasButton onClick={() => commit(emptyBuild())}>{t.start}</AtlasButton></div>}
    <div className={styles.toolbar}>
      <ForeverFilters lang={lang} live className={styles.fields}>
        <ForeverSelect id="forever-level" label={t.level} value={build.level} options={levels} onChange={event => setLevel("level", Number(event.target.value))} />
        <ForeverSelect id="forever-legacy" label={t.talented} value={build.talented} options={legacyRanks} onChange={event => setLevel("talented", Number(event.target.value))} />
      </ForeverFilters>
      <p className={styles.budget}>
        <strong key={pulse?.n ?? 0} data-points-left data-beat={pulse ? "" : undefined}>{budget - spent}</strong>
        <span>{t.remaining}</span>
        {spent > 0 && <small>{t.requiredLevel}: {requiredLevel(cls,build)}</small>}
      </p>
      <div className={styles.actions}>
        <AtlasButton icon={<Undo2 aria-hidden size={16} />} disabled={!history.length} onClick={undo}>{t.undo}</AtlasButton>
        <AtlasButton icon={<RotateCcw aria-hidden size={16} />} disabled={!spent} onClick={() => commit({ ...build, ranks: {} })}>{t.reset}</AtlasButton>
        <AtlasButton icon={<Copy aria-hidden size={16} />} onClick={share}>{t.share}</AtlasButton>
      </div>
    </div>
    <p className={styles.message} role="status"><span data-quiet={status.quiet ? "" : undefined}>{status.text}</span></p>
    <noscript><p>{t.noScript}</p></noscript>
    <AtlasSegmented aria-label={t.trees} className={styles.treeSwitch} fullWidth value={activeTree} onValueChange={openTree}
      options={cls.trees.map(tree => ({
        value: String(tree.id),
        // eslint-disable-next-line @next/next/no-img-element -- local client-derived tree icon
        icon: <img src={foreverTalentIcon(tree.iconFileId)} width={24} height={24} alt="" />,
        label: <>{tree.name[lang]}<small>{treePoints(tree, build.ranks)}</small></>,
      }))} />
    <div className={styles.workspace}>
      <div className={styles.trees}>
        {cls.trees.map(tree => <TalentTree key={tree.id} classSlug={cls.slug} tree={tree} build={build} lang={lang} open={String(tree.id) === activeTree}
          canSpend={spent < budget} touch={touch} pulse={pulse} shownId={shown.node.id} tabStopId={focusNodes[tree.id] ?? tree.nodes[0].id}
          onShow={(node, focused) => { setShown({ tree, node }); if (focused) setFocusNodes(current => ({ ...current, [tree.id]: node.id })); }}
          onEdit={edit} onKey={(event, node) => navigate(event, tree, node)} onReset={() => resetTree(tree)} />)}
      </div>
      <aside className={styles.detail} aria-label={t.inspector}>
        <TalentDetail tree={shown.tree} node={shown.node} rank={build.ranks[shown.node.id] ?? 0} lang={lang} left={budget - spent}
          requirements={requirementText(shown.tree, shown.node)}
          canAdd={Boolean(changeRank(cls, build, shown.node.id, 1))} canRemove={Boolean(changeRank(cls, build, shown.node.id, -1))}
          onEdit={delta => edit(shown.node, delta)} />
      </aside>
    </div>
  </>;
}
