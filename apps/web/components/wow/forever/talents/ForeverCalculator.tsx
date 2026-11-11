"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { Copy, Minus, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasDialog } from "@gildra/atlas-ui/AtlasDialog";
import { AtlasField, AtlasSelect } from "@gildra/atlas-ui/AtlasField";
import { AtlasTabs } from "@gildra/atlas-ui/AtlasTabs";
import { MaterialPlaque } from "@/components/wow/shared/material/MaterialPlaque";
import { changeRank, decodeBuild, emptyBuild, encodeBuild, gatePoints, pointBudget, requiredLevel, requirementsMet, spentPoints, treePoints, validateBuild } from "@/lib/forever/talents/engine";
import { foreverTalentIcon, foreverTalentSpellPath } from "@/lib/forever/talents/links";
import type { BuildError, TalentBuild, TalentClass, TalentNode, TalentTree } from "@/lib/forever/talents/types";
import { notifyForeverNavigation } from "../map/navigation";
import { talentCopy } from "./talentCopy";
import styles from "./talents.module.css";

type Props = { cls: TalentClass; snapshot: string; lang: "en" | "ru"; initial: TalentBuild; initialError: BuildError | null };
const compactQuery = "(max-width: 1179px)";
function subscribeCompact(callback: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
const serverCompact = () => false;
const treeSlug = (tree: TalentTree) => `tree-${tree.name.en.toLowerCase().replaceAll(" ", "-")}`;

export function ForeverCalculator({ cls, snapshot, lang, initial, initialError }: Props) {
  const t = talentCopy[lang];
  const compact = useSyncExternalStore(subscribeCompact, compactSnapshot, serverCompact);
  const [build, setBuild] = useState(initial);
  const [error, setError] = useState(initialError);
  const [history, setHistory] = useState<TalentBuild[]>([]);
  const [shown, setShown] = useState({ tree: cls.trees[0], node: cls.trees[0].nodes[0] });
  const [sheet, setSheet] = useState(false);
  const [activeTree, setActiveTree] = useState(String(cls.trees[0].id));
  const [focusNodes, setFocusNodes] = useState<Record<number, number>>({});
  const [message, setMessage] = useState("");
  const spent = spentPoints(build.ranks);
  const budget = Math.min(cls.maxPoints, pointBudget(build.level, build.talented));

  function sync(next: TalentBuild) {
    const url = new URL(window.location.href);
    url.searchParams.set("build", encodeBuild(cls, snapshot, next));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    notifyForeverNavigation();
  }
  function commit(next: TalentBuild, announcement = "") {
    setHistory(items => [...items.slice(-99), build]);
    setBuild(next); setError(null); setMessage(announcement); sync(next);
  }
  function edit(node: TalentNode, delta: 1 | -1) {
    const next = changeRank(cls, build, node.id, delta);
    if (next) commit(next, `${node.name[lang]} ${(next.ranks[node.id] ?? 0)}/${node.maxRanks} · ${t.remaining}: ${pointBudget(next.level, next.talented) - spentPoints(next.ranks)}`);
    else setMessage(t.unavailable);
  }
  function setLevel(field: "level" | "talented", value: number) {
    const next = { ...build, [field]: value };
    if (validateBuild(cls, next)) setMessage(t.levelConflict); else commit(next);
  }
  function resetTree(tree: TalentTree) {
    const ranks = { ...build.ranks };
    tree.nodes.forEach(node => delete ranks[node.id]);
    commit({ ...build, ranks });
  }
  async function share() {
    sync(build);
    try { await navigator.clipboard.writeText(window.location.href); setMessage(t.copied); }
    catch { setMessage(t.copyFailed); }
  }

  useEffect(() => {
    const selectHash = () => {
      const tree = cls.trees.find(item => `#${treeSlug(item)}` === window.location.hash);
      if (tree) { setActiveTree(String(tree.id)); setShown({ tree, node: tree.nodes[0] }); }
    };
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const result = decodeBuild(cls, snapshot, params.getAll("build").length > 1 ? "invalid" : params.get("build"));
      setBuild(result.build); setError(result.error); setHistory([]); setSheet(false); setMessage(""); selectHash();
    };
    selectHash();
    window.addEventListener("popstate", restore); window.addEventListener("hashchange", selectHash);
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("hashchange", selectHash); };
  }, [cls, snapshot]);

  function requirementText(tree: TalentTree, node: TalentNode) {
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

  function focusNode(tree: TalentTree, node: TalentNode) {
    setFocusNodes(current => ({ ...current, [tree.id]: node.id })); setActiveTree(String(tree.id)); setShown({ tree, node });
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-node="${node.id}"]`)?.focus());
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, tree: TalentTree, node: TalentNode) {
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

  function renderTree(tree: TalentTree) {
    return <section key={tree.id} id={treeSlug(tree)} className={styles.tree} aria-labelledby={`heading-${tree.id}`}>
      <div className={styles.treeHead}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local client-derived tree icon */}
        <img src={foreverTalentIcon(tree.iconFileId)} width={28} height={28} alt="" />
        <h2 id={`heading-${tree.id}`}>{tree.name[lang]}</h2><span aria-label={`${t.spent}: ${treePoints(tree, build.ranks)}`} data-tree-points>{treePoints(tree, build.ranks)}</span>
        <AtlasButton size="sm" variant="ghost" disabled={!treePoints(tree,build.ranks)} aria-label={`${t.resetTree}: ${tree.name[lang]}`} onClick={() => resetTree(tree)} icon={<RotateCcw aria-hidden size={16} />}>{null}</AtlasButton>
      </div>
      <div className={styles.grid}>
        <svg className={styles.edges} viewBox="0 0 400 784" preserveAspectRatio="none" aria-hidden="true">
          <defs><marker id={`arrow-${tree.id}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" /></marker></defs>
          {tree.nodes.flatMap(node => node.prerequisites.map(pre => {
            const parent = tree.nodes.find(n => n.id === pre.nodeId)!;
            const x = parent.column * 100 + 50, y = parent.row * 112 + 52;
            const endX = node.column * 100 + 50, endY = node.row * 112 - 3;
            return <path key={`${parent.id}-${node.id}`} data-met={(build.ranks[parent.id] ?? 0) >= pre.ranks} d={`M${x},${y} V${endY - 10} H${endX} V${endY}`} markerEnd={`url(#arrow-${tree.id})`} />;
          }))}
        </svg>
        {tree.nodes.map(node => {
          const rank = build.ranks[node.id] ?? 0;
          const unlocked = requirementsMet(tree, node, build.ranks) && build.level + build.talented >= node.level;
          return <div key={node.id} className={styles.nodeSlot} style={{ gridRow: node.row + 1, gridColumn: node.column + 1 }}>
            <button className={styles.node} type="button" data-node={node.id} data-rank={rank} data-locked={!unlocked} data-max={rank === node.maxRanks}
              tabIndex={(focusNodes[tree.id] ?? tree.nodes[0].id) === node.id ? 0 : -1}
              aria-label={`${node.name[lang]}, ${t.rank} ${rank}/${node.maxRanks}`} aria-disabled={!unlocked || rank === node.maxRanks || spent >= budget}
              onFocus={() => { setShown({ tree, node }); setFocusNodes(current => ({ ...current, [tree.id]: node.id })); }}
              onPointerEnter={event => { if (event.pointerType === "mouse") setShown({ tree, node }); }}
              onClick={event => {
                setShown({ tree, node });
                if (event.detail > 0 && window.matchMedia("(pointer: coarse)").matches) setSheet(true);
                else edit(node, event.shiftKey ? -1 : 1);
              }}
              onContextMenu={event => { event.preventDefault(); setShown({ tree,node }); edit(node,-1); }}
              onKeyDown={event => navigate(event, tree, node)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local client-derived icon, fixed dimensions */}
              <img src={foreverTalentIcon(node.iconFileId)} width={44} height={44} alt="" loading="lazy" />
              <span className={styles.rank}>{rank}/{node.maxRanks}</span>
            </button>
            <span className={styles.nodeName}>{node.name[lang]}</span>
          </div>;
        })}
      </div>
    </section>;
  }

  function details(isSheet = false) {
    const rank = build.ranks[shown.node.id] ?? 0, requirements = requirementText(shown.tree,shown.node);
    return <>
      <div className={styles.dialogHead}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local client-derived icon */}
        <img src={foreverTalentIcon(shown.node.iconFileId)} width={44} height={44} alt="" />
        <h2>{shown.node.name[lang]}</h2>
        {isSheet && <AtlasButton size="sm" variant="ghost" aria-label={t.close} onClick={() => setSheet(false)} icon={<X aria-hidden size={20} />}>{null}</AtlasButton>}
      </div>
      <p>{t.rank} <strong data-selected-rank>{rank}/{shown.node.maxRanks}</strong></p>
      {rank > 0 && <div className={styles.description}><h3>{t.currentRank}</h3><p>{shown.node.descriptions[lang][rank - 1]}</p></div>}
      {rank < shown.node.maxRanks && <div className={styles.description}><h3>{t.nextRank}</h3><p>{shown.node.descriptions[lang][rank]}</p></div>}
      {requirements.length > 0 && <div className={styles.requirements}><h3>{t.requires}</h3><ul>{requirements.map(line => <li key={line}>{line}</li>)}</ul></div>}
      <div className={styles.dialogActions}>
        <AtlasButton variant="primary" icon={<Plus aria-hidden size={16} />} disabled={!changeRank(cls, build, shown.node.id, 1)} onClick={() => edit(shown.node, 1)}>{t.add}</AtlasButton>
        <AtlasButton icon={<Minus aria-hidden size={16} />} disabled={!changeRank(cls, build, shown.node.id, -1)} onClick={() => edit(shown.node, -1)}>{t.remove}</AtlasButton>
      </div>
      <a className={styles.spellLink} href={foreverTalentSpellPath(lang, shown.node.rankSpellIds[Math.max(0,rank - 1)])}>{t.details}</a>
    </>;
  }

  return <MaterialPlaque kit="talents" className={styles.calculator} data-forever-calculator={cls.slug}>
    {error && <div className={styles.invalid}><p role="alert">{error === "snapshot" ? t.stale : t.invalid}</p><AtlasButton onClick={() => commit(emptyBuild())}>{t.start}</AtlasButton></div>}
    <div className={styles.toolbar}>
      <AtlasField label={t.level} htmlFor="forever-level"><AtlasSelect id="forever-level" value={build.level} onChange={event => setLevel("level", Number(event.target.value))}>
        {Array.from({ length: 60 }, (_, i) => i + 1).map(level => <option key={level} value={level}>{level}</option>)}
      </AtlasSelect></AtlasField>
      <AtlasField label={t.talented} htmlFor="forever-legacy"><AtlasSelect id="forever-legacy" value={build.talented} onChange={event => setLevel("talented", Number(event.target.value))}>
        {[0,1,2,3,4,5].map(rank => <option key={rank} value={rank}>{rank}/5</option>)}
      </AtlasSelect></AtlasField>
      <div className={styles.budget}><strong data-points-left>{budget - spent}</strong><span>{t.remaining}</span>{spent > 0 && <small>{t.requiredLevel}: {requiredLevel(cls,build)}</small>}</div>
      <div className={styles.actions}>
        <AtlasButton icon={<Undo2 aria-hidden size={16} />} disabled={!history.length} onClick={() => {
          const previous = history[history.length - 1]; setHistory(items => items.slice(0,-1)); setBuild(previous); setMessage(""); sync(previous);
        }}>{t.undo}</AtlasButton>
        <AtlasButton icon={<RotateCcw aria-hidden size={16} />} disabled={!spent} onClick={() => commit({ ...build, ranks: {} })}>{t.reset}</AtlasButton>
        <AtlasButton icon={<Copy aria-hidden size={16} />} onClick={share}>{t.share}</AtlasButton>
      </div>
    </div>
    <p className={styles.message} role="status">{message}</p>
    <noscript><p>{t.noScript}</p></noscript>
    <div className={styles.workspace}>
      {compact ? <AtlasTabs label={t.trees} variant="segmented" value={activeTree} onChange={setActiveTree} className={styles.treeTabs}
        tabs={cls.trees.map(tree => ({ id: String(tree.id), label: tree.name[lang], count: treePoints(tree,build.ranks), content: renderTree(tree) }))} />
        : <div className={styles.trees}>{cls.trees.map(renderTree)}</div>}
      <aside className={styles.detail} aria-label={t.inspector}>{details()}</aside>
    </div>
    <AtlasDialog open={sheet} onClose={() => setSheet(false)} label={shown.node.name[lang]} variant="sheet" className={styles.dialog}>{sheet && details(true)}</AtlasDialog>
  </MaterialPlaque>;
}
