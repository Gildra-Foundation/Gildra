"use client";

import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { TalentKind, TalentNode, TalentTree as TalentTreeData } from "@/lib/talentCalculatorData";
import { nodeAvailability, nodeShape, type ChoiceMap, type RankMap, type TalentNodeCatalog, type TreeGeometry } from "@/lib/talentLoadoutState";
import { lessMotion } from "@/lib/client/motionPreference";
import type { TalentCalculatorCopy } from "./talentCalculatorCopy";
import styles from "./talentTree.module.css";

export type PointerKind = "mouse" | "touch" | "keyboard";
/** What the page does with a node; every handler returns whether the build changed. */
export type TalentTreeActions = {
  activate: (node: TalentNode, pointer: PointerKind) => boolean;
  decrement: (node: TalentNode) => boolean;
  cycle: (node: TalentNode, direction: 1 | -1) => boolean;
  /** Pointer or keyboard focus on a node (null when it leaves the tree). */
  inspect: (node: TalentNode | null, anchor: HTMLElement | null, pointer: PointerKind) => void;
};

type NodeState = "selected" | "partial" | "open" | "locked";
const UNVERIFIED_ICON = "/assets/wow/icon-unverified.svg";

function TalentIcon({ src, className }: { src?: string; className?: string }) {
  return <img className={className} src={src || UNVERIFIED_ICON} alt="" width={56} height={56} loading="lazy" decoding="async" draggable={false}
    onError={(event) => { if (!event.currentTarget.src.endsWith(UNVERIFIED_ICON)) event.currentTarget.src = UNVERIFIED_ICON; }} />;
}

type NodeProps = { node: TalentNode; rank: number; state: NodeState; choiceIndex: number; dimmed: boolean; tabbable: boolean; inspected: boolean; label: string };

const TalentNodeButton = memo(function TalentNodeButton({ node, rank, state, choiceIndex, dimmed, tabbable, inspected, label }: NodeProps) {
  const shape = nodeShape(node);
  const split = node.nodeType === "choice" && choiceIndex < 0 && node.choices.length > 1;
  const choice = node.choices[Math.max(0, choiceIndex)] ?? node.choices[0];
  return <button
    type="button"
    className={styles.node}
    data-talent-node={node.id}
    data-shape={shape}
    data-state={state}
    data-dimmed={dimmed || undefined}
    data-inspected={inspected || undefined}
    style={{ left: `${node.x}%`, top: `${node.y}%` }}
    tabIndex={tabbable ? 0 : -1}
    aria-pressed={rank > 0}
    aria-disabled={state === "locked" || undefined}
    aria-label={label}
  >
    <span className={styles.art} aria-hidden="true">
      {split ? <><TalentIcon src={node.choices[0].iconUrl} className={styles.splitA} /><TalentIcon src={node.choices[1].iconUrl} className={styles.splitB} /></> : <TalentIcon src={choice?.iconUrl} />}
    </span>
    <span className={styles.flash} data-flash aria-hidden="true" />
    {node.maxRanks > 1 ? <span className={styles.pips} aria-hidden="true">{Array.from({ length: node.maxRanks }, (_, index) => <i key={index} data-on={index < rank || undefined} />)}</span> : null}
  </button>;
});

function flash(element: HTMLElement | null) {
  const target = element?.querySelector<HTMLElement>("[data-flash]");
  if (!target || lessMotion()) return;
  target.animate([
    { opacity: 0.9, transform: "scale(.86)" },
    { opacity: 0, transform: "scale(1.32)" },
  ], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
}

type TreeProps = {
  tree: TalentTreeData;
  kind: TalentKind;
  title: string;
  geometry: TreeGeometry;
  ranks: RankMap;
  choices: ChoiceMap;
  spent: number;
  catalog: TalentNodeCatalog;
  copy: TalentCalculatorCopy;
  matches: Set<string> | null;
  inspectedId: string | null;
  actions: TalentTreeActions;
};

/**
 * One talent tree laid out on the game grid: node x/y are % of a canvas whose aspect follows the grid, so every
 * tree shares one cell size. Events are delegated to the canvas; nodes only re-render when their own state changes.
 */
export const TalentTree = memo(function TalentTree({ tree, kind, title, geometry, ranks, choices, spent, catalog, copy, matches, inspectedId, actions }: TreeProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<PointerKind>("mouse");
  const blockersRef = useRef<Element[]>([]);
  const firstId = useMemo(() => (tree.nodes.find((node) => node.entryNode) ?? [...tree.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0])?.id ?? "", [tree.nodes]);
  const [tabId, setTabId] = useState(firstId);
  const byId = useMemo(() => new Map(tree.nodes.map((node) => [node.id, node])), [tree.nodes]);

  const views = useMemo(() => tree.nodes.map((node) => {
    const rank = ranks.get(node.id) ?? 0;
    const availability = nodeAvailability(node, kind, ranks, spent, catalog, copy);
    const state: NodeState = rank ? (rank < node.maxRanks ? "partial" : "selected") : availability.available ? "open" : "locked";
    const choiceIndex = node.choices.findIndex((choice) => choice.externalId === choices.get(node.id));
    const selectedName = node.choices[choiceIndex]?.name;
    const names = node.nodeType === "tiered" ? (node.choices[0]?.name ?? copy.apex) : selectedName ?? node.choices.map((choice) => choice.name).join(copy.or);
    const label = copy.nodeLabel({ names, rank, maxRanks: node.maxRanks, lockReason: availability.available ? undefined : availability.reason });
    return { node, rank, state, choiceIndex: rank ? Math.max(0, choiceIndex) : -1, label, blockers: availability.blockerNodeIds };
  }), [catalog, choices, copy, kind, ranks, spent, tree.nodes]);
  const blockersOf = useMemo(() => new Map(views.map((view) => [view.node.id, view.blockers])), [views]);

  const nodeOf = (target: EventTarget | null) => {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-talent-node]") : null;
    const node = element ? byId.get(element.dataset.talentNode!) : undefined;
    return node && element ? { node, element } : null;
  };

  const markBlockers = useCallback((nodeId: string | null) => {
    blockersRef.current.forEach((element) => element.removeAttribute("data-blocker"));
    blockersRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas || !nodeId) return;
    for (const id of blockersOf.get(nodeId) ?? []) {
      const element = canvas.querySelector(`[data-talent-node="${CSS.escape(id)}"]`);
      if (element) { element.setAttribute("data-blocker", ""); blockersRef.current.push(element); }
    }
  }, [blockersOf]);

  const onPointerDown = (event: ReactPointerEvent) => { pointerRef.current = event.pointerType === "touch" || event.pointerType === "pen" ? "touch" : "mouse"; };
  const onClick = (event: MouseEvent) => {
    const hit = nodeOf(event.target);
    if (!hit) return;
    // A click without a preceding pointer (Enter/Space) comes from the keyboard.
    const pointer: PointerKind = event.detail === 0 ? "keyboard" : pointerRef.current;
    setTabId(hit.node.id);
    if (actions.activate(hit.node, pointer)) flash(hit.element);
    actions.inspect(hit.node, hit.element, pointer);
    markBlockers(hit.node.id);
  };
  const onContextMenu = (event: MouseEvent) => {
    const hit = nodeOf(event.target);
    if (!hit) return;
    event.preventDefault();
    if (actions.decrement(hit.node)) flash(hit.element);
  };
  const onPointerOver = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    const hit = nodeOf(event.target);
    if (!hit) return;
    markBlockers(hit.node.id);
    actions.inspect(hit.node, hit.element, "mouse");
  };
  const onPointerOut = (event: ReactPointerEvent) => {
    if (event.pointerType === "touch") return;
    const hit = nodeOf(event.target);
    if (!hit || hit.element.contains(event.relatedTarget as Node | null)) return;
    markBlockers(null);
    actions.inspect(null, null, "mouse");
  };
  const onFocus = (event: FocusEvent) => {
    const hit = nodeOf(event.target);
    if (!hit || !hit.element.matches(":focus-visible")) return;
    setTabId(hit.node.id);
    markBlockers(hit.node.id);
    actions.inspect(hit.node, hit.element, "keyboard");
  };
  const onBlur = (event: FocusEvent) => {
    if (canvasRef.current?.contains(event.relatedTarget as Node | null)) return;
    markBlockers(null);
    actions.inspect(null, null, "keyboard");
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const hit = nodeOf(event.target);
    if (!hit) return;
    const { node, element } = hit;
    const move = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Home: "home", End: "end" }[event.key] as "up" | "down" | "left" | "right" | "home" | "end" | undefined;
    if (move) {
      event.preventDefault();
      const target = neighbour(tree.nodes, node, move);
      if (!target) return;
      setTabId(target.id);
      canvasRef.current?.querySelector<HTMLElement>(`[data-talent-node="${CSS.escape(target.id)}"]`)?.focus();
    } else if (event.key === "Backspace" || event.key === "Delete" || event.key === "-") {
      event.preventDefault();
      if (actions.decrement(node)) flash(element);
    } else if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      if (actions.cycle(node, event.key === "]" ? 1 : -1)) flash(element);
    }
  };

  const used = (id: string) => (ranks.get(id) ?? 0) > 0;
  return <div
    ref={canvasRef}
    className={styles.canvas}
    data-tree-canvas={kind}
    role="group"
    aria-label={title}
    style={{ "--cells-x": geometry.cellsX, "--cells-y": geometry.cellsY } as CSSProperties}
    onPointerDown={onPointerDown}
    onClick={onClick}
    onContextMenu={onContextMenu}
    onPointerOver={onPointerOver}
    onPointerOut={onPointerOut}
    onFocus={onFocus}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
  >
    <svg className={styles.lines} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {geometry.edges.map(([from, to]) => {
        const lit = used(from.id) && used(to.id);
        const open = !lit && used(from.id);
        const dimmed = matches !== null && !matches.has(from.id) && !matches.has(to.id);
        return <line key={`${from.id}-${to.id}`} data-state={lit ? "lit" : open ? "open" : undefined} data-dimmed={dimmed || undefined} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
      })}
    </svg>
    {views.map((view) => <TalentNodeButton key={view.node.id} node={view.node} rank={view.rank} state={view.state} choiceIndex={view.choiceIndex} label={view.label}
      dimmed={matches !== null && !matches.has(view.node.id)} tabbable={view.node.id === (byId.has(tabId) ? tabId : firstId)} inspected={view.node.id === inspectedId} />)}
  </div>;
});

function neighbour(nodes: TalentNode[], current: TalentNode, direction: "up" | "down" | "left" | "right" | "home" | "end") {
  if (direction === "home" || direction === "end") {
    const ordered = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);
    return direction === "home" ? ordered[0] : ordered[ordered.length - 1];
  }
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  return nodes
    .filter((node) => node.id !== current.id && Math.sign((horizontal ? node.x - current.x : node.y - current.y)) === sign)
    .sort((a, b) => {
      const cross = (node: TalentNode) => Math.abs(horizontal ? node.y - current.y : node.x - current.x);
      const primary = (node: TalentNode) => Math.abs(horizontal ? node.x - current.x : node.y - current.y);
      return cross(a) * 2 + primary(a) - (cross(b) * 2 + primary(b));
    })[0];
}
