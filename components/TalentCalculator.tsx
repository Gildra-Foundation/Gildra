"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PvPTalent, TalentCalculatorData, TalentChoice, TalentNode, TalentTree, TalentKind } from "@/lib/talentCalculatorData";
import { midnightManifest } from "@/lib/midnightManifest";

type TooltipState = { kind: "tree"; node: TalentNode; treeKind: TalentKind; left: number; top: number } | { kind: "pvp"; talent: PvPTalent; left: number; top: number } | null;
type ChoiceState = Map<string, number>;
type Notice = { message: string; persistent?: boolean } | null;
type OpenTooltip = (node: TalentNode, target: HTMLButtonElement) => void;
type RootOpenTooltip = (node: TalentNode, target: HTMLButtonElement, treeKind: TalentKind) => void;

function countRanks(ranks: Map<string, number>, kind: TalentKind) {
  return [...ranks.entries()].filter(([id]) => id.startsWith(`${kind}-`)).reduce((sum, [, value]) => sum + value, 0);
}

function totalSpent(ranks: Map<string, number>) {
  return [...ranks.values()].reduce((sum, value) => sum + value, 0);
}

function plural(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return `${value} ${mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? few : many}`;
}

function edgeList(nodes: TalentNode[]) {
  const byNodeId = new Map(nodes.map((node) => [node.nodeId, node]));
  const edges: [TalentNode, TalentNode][] = [];
  nodes.forEach((node) => {
    node.nextNodeIds.forEach((nextNodeId) => {
      const target = byNodeId.get(nextNodeId);
      if (target) edges.push([node, target]);
    });
  });
  return edges;
}

function nodeAvailability(node: TalentNode, treeKind: TalentKind, ranks: Map<string, number>, spentInTree: number) {
  const currentRank = ranks.get(node.id) ?? 0;
  const spentBeforeNode = Math.max(0, spentInTree - currentRank);
  if (node.freeNode) return { available: true, reason: "" };
  if (node.requiredPoints && spentBeforeNode < node.requiredPoints) return { available: false, reason: `Нужно потратить ещё ${node.requiredPoints - spentBeforeNode} очк.` };
  if (node.requiresNodeIds.length && !node.requiresNodeIds.some((nodeId) => ["class", "hero", "spec"].some((kind) => (ranks.get(`${kind}-${nodeId}`) ?? 0) > 0))) return { available: false, reason: "Сначала нужен связанный талант" };
  if (node.prevNodeIds.length && !node.prevNodeIds.some((nodeId) => (ranks.get(`${treeKind}-${nodeId}`) ?? 0) > 0)) return { available: false, reason: "Сначала выберите предыдущий талант" };
  return { available: true, reason: "" };
}

function Tooltip({ node, left, top, id, selectedChoice, lockReason }: { node: TalentNode; left: number; top: number; id: string; selectedChoice?: number; lockReason?: string }) {
  return (
    <aside className="tc-tooltip" id={id} role="tooltip" style={{ left, top }}>
      {node.nodeType === "tiered"
        ? <TalentTieredTooltip node={node} />
        : node.choices.map((choice, index) => <TalentTooltipChoice choice={choice} key={choice.externalId} index={index} showChoice={node.nodeType === "choice"} tiered={false} selected={selectedChoice === choice.externalId} />)}
      {lockReason ? <div className="tc-tooltip-lock">{lockReason}</div> : null}
      <div className="tc-tooltip-foot"><span>Midnight · талант {node.nodeId}</span>{node.nodeType === "choice" ? <span>Повторный клик или [ / ] меняет вариант</span> : null}</div>
    </aside>
  );
}

function PvpTooltip({ talent, left, top, id, selected }: { talent: PvPTalent; left: number; top: number; id: string; selected: boolean }) {
  const iconSource = talent.iconSource === "fallback" ? "Локальная замена" : "Blizzard Render / DB2";
  return <aside className="tc-tooltip tc-pvp-tooltip" id={id} role="tooltip" style={{ left, top }}>
    <div className="tc-tooltip-choice is-selected">
      <div className="tc-tooltip-heading">
        {talent.iconUrl ? <img src={talent.iconUrl} alt="" onError={(event) => { event.currentTarget.src = "/assets/classes/warrior.jpg"; }} /> : null}
        <div><strong>{talent.name}</strong><span>PvP-талант · {selected ? "выбран" : "доступен"}{talent.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      <p>{talent.description || "Описание таланта пока недоступно."}</p>
    </div>
    <div className="tc-tooltip-foot"><span>Midnight · PvP · {talent.buildVersion}</span><span>Источник: {iconSource}</span></div>
  </aside>;
}

function TalentTieredTooltip({ node }: { node: TalentNode }) {
  const icon = node.choices[0]?.iconUrl;
  let firstRank = 1;
  return (
    <div className="tc-tooltip-tiered">
      <div className="tc-tooltip-heading">
        {icon ? <img src={icon} alt="" onError={(event) => { event.currentTarget.src = "/assets/classes/warrior.jpg"; }} /> : null}
        <div><strong>{node.choices[0]?.name ?? "Apex Talent"}</strong><span>Apex Talent · последовательные ранги{node.choices[0]?.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      {node.choices.map((choice) => {
        const start = firstRank;
        firstRank += choice.maxRanks;
        return <div className="tc-tooltip-tier" key={choice.externalId}><b>Ранг {start}{choice.maxRanks > 1 ? `–${start + choice.maxRanks - 1}` : ""}</b><p>{choice.description}</p></div>;
      })}
    </div>
  );
}

function TalentTooltipChoice({ choice, index, showChoice, tiered, selected }: { choice: TalentChoice; index: number; showChoice: boolean; tiered: boolean; selected: boolean }) {
  return (
    <div className={`tc-tooltip-choice${selected ? " is-selected" : ""}`}>
      <div className="tc-tooltip-heading">
        {showChoice ? <span className="tc-choice-marker" aria-hidden="true">{selected ? "✓" : index + 1}</span> : null}
        {choice.iconUrl ? <img src={choice.iconUrl} alt="" onError={(event) => { event.currentTarget.src = "/assets/classes/warrior.jpg"; }} /> : null}
        <div><strong>{choice.name}</strong><span>{showChoice ? `Вариант ${index + 1} · ` : tiered ? `Уровень ${index + 1} · ` : ""}{choice.talentType === "active" ? "Активная способность" : "Пассивный эффект"}{choice.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      <p>{choice.description || "Описание таланта пока недоступно."}</p>
      <small>Макс. ранг: {choice.maxRanks}</small>
    </div>
  );
}

type TalentNodeView = { node: TalentNode; rank: number; selectedChoice?: number; available: boolean; lockReason: string; hasMatch: boolean };
type MoveDirection = "up" | "down" | "left" | "right" | "home" | "end";

const TalentNodeButton = memo(function TalentNodeButton({ view, tooltipOpen, tabIndex, openTooltip, closeTooltip, onRank, onCycleChoice, onMoveFocus, onFocusNode }: { view: TalentNodeView; tooltipOpen: boolean; tabIndex: number; openTooltip: OpenTooltip; closeTooltip: () => void; onRank: (node: TalentNode, direction: 1 | -1) => void; onCycleChoice: (node: TalentNode, direction: 1 | -1) => void; onMoveFocus: (node: TalentNode, direction: MoveDirection) => void; onFocusNode: (nodeId: string) => void }) {
  const { node, rank, selectedChoice, available, lockReason, hasMatch } = view;
  const selected = node.choices.find((choice) => choice.externalId === selectedChoice);
  return (
    <button
      className={`tc-node ${node.talentType} ${node.nodeType}${rank ? " is-selected" : ""}${!available ? " is-locked" : ""}${hasMatch ? "" : " is-dimmed"}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      type="button"
      data-node-id={node.id}
      tabIndex={tabIndex}
      aria-label={`${node.nodeType === "tiered" ? (node.choices[0]?.name ?? "Apex Talent") : node.choices.map((choice) => choice.name).join(" или ")}, ${node.nodeType === "tiered" ? "последовательные ранги" : `выбранный вариант ${selected?.name ?? "не выбран"}`}, ранг ${rank} из ${node.maxRanks}${available ? "" : `, недоступен: ${lockReason}`}`}
      aria-describedby={tooltipOpen ? `tooltip-${node.id}` : undefined}
      aria-pressed={rank > 0}
      aria-disabled={!available}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onMoveFocus(node, event.key.slice(5).toLowerCase() as MoveDirection);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          onMoveFocus(node, event.key.toLowerCase() as MoveDirection);
        } else if ((event.key === "Backspace" || event.key === "Delete") && rank > 0) {
          event.preventDefault();
          onRank(node, -1);
        } else if (event.key === "]" && available && node.nodeType === "choice" && rank >= node.maxRanks) {
          event.preventDefault();
          onCycleChoice(node, 1);
        } else if (event.key === "[" && available && node.nodeType === "choice" && rank >= node.maxRanks) {
          event.preventDefault();
          onCycleChoice(node, -1);
        }
      }}
      onMouseEnter={(event) => openTooltip(node, event.currentTarget)}
      onMouseLeave={closeTooltip}
      onFocus={(event) => { onFocusNode(node.id); openTooltip(node, event.currentTarget); }}
      onBlur={closeTooltip}
      onClick={(event) => { if (available && node.nodeType === "choice" && rank >= node.maxRanks) onCycleChoice(node, 1); else if (available) onRank(node, 1); openTooltip(node, event.currentTarget); }}
      onContextMenu={(event) => { event.preventDefault(); if (rank > 0) onRank(node, -1); }}
    >
      <span className="tc-node-ring" />
      <img loading="lazy" decoding="async" data-icon-source={selected?.iconSource || node.choices[0]?.iconSource || "fallback"} data-icon-fallback={(selected?.iconFallback || node.choices[0]?.iconFallback) ? "true" : undefined} src={selected?.iconUrl || node.choices[0]?.iconUrl || "/assets/classes/warrior.jpg"} alt="" onError={(event) => { if (event.currentTarget.src.endsWith("/assets/classes/warrior.jpg")) return; event.currentTarget.src = "/assets/classes/warrior.jpg"; event.currentTarget.dataset.iconSource = "fallback"; event.currentTarget.dataset.iconFallback = "true"; }} />
      <span className="tc-node-count">{rank}/{node.maxRanks}</span>
    </button>
  );
}, (previous, next) => previous.view.node === next.view.node
  && previous.view.rank === next.view.rank
  && previous.view.selectedChoice === next.view.selectedChoice
  && previous.view.available === next.view.available
  && previous.view.lockReason === next.view.lockReason
  && previous.view.hasMatch === next.view.hasMatch
  && previous.tabIndex === next.tabIndex
  && previous.tooltipOpen === next.tooltipOpen
  && previous.openTooltip === next.openTooltip
  && previous.closeTooltip === next.closeTooltip
  && previous.onRank === next.onRank
  && previous.onCycleChoice === next.onCycleChoice
  && previous.onMoveFocus === next.onMoveFocus
  && previous.onFocusNode === next.onFocusNode);

const TalentTreeView = memo(function TalentTreeView({ tree, ranks, choices, onRank, onCycleChoice, query, tooltipNodeId, openTooltip, closeTooltip }: { tree: TalentTree; ranks: Map<string, number>; choices: ChoiceState; onRank: (node: TalentNode, direction: 1 | -1) => void; onCycleChoice: (node: TalentNode, direction: 1 | -1) => void; query: string; tooltipNodeId?: string; openTooltip: RootOpenTooltip; closeTooltip: () => void }) {
  const [focusedNodeId, setFocusedNodeId] = useState(tree.nodes[0]?.id ?? "");
  const openTreeTooltip = useCallback((node: TalentNode, target: HTMLButtonElement) => openTooltip(node, target, tree.kind), [openTooltip, tree.kind]);
  const edges = useMemo(() => edgeList(tree.nodes), [tree.nodes]);
  const normalizedQuery = query.trim().toLowerCase();
  const spentInTree = useMemo(() => countRanks(ranks, tree.kind), [ranks, tree.kind]);
  const nodeViews = useMemo<TalentNodeView[]>(() => tree.nodes.map((node) => {
    const rank = ranks.get(node.id) ?? 0;
    const selectedChoice = choices.get(node.id);
    const availability = nodeAvailability(node, tree.kind, ranks, spentInTree);
    const hasMatch = normalizedQuery === "" || node.choices.some((choice) => `${choice.name} ${choice.description}`.toLowerCase().includes(normalizedQuery));
    return { node, rank, selectedChoice, available: availability.available, lockReason: availability.reason, hasMatch };
  }), [choices, normalizedQuery, ranks, spentInTree, tree.kind, tree.nodes]);
  const matchedNodeIds = useMemo(() => new Set(nodeViews.filter((view) => view.hasMatch).map((view) => view.node.id)), [nodeViews]);
  const moveFocus = useCallback((current: TalentNode, direction: MoveDirection) => {
    const currentIndex = tree.nodes.findIndex((node) => node.id === current.id);
    if (currentIndex < 0) return;
    let target: TalentNode | undefined;
    if (direction === "home" || direction === "end") {
      const ordered = [...tree.nodes].sort((a, b) => a.y - b.y || a.x - b.x);
      target = direction === "home" ? ordered[0] : ordered[ordered.length - 1];
    } else {
      const horizontal = direction === "left" || direction === "right";
      const candidates = tree.nodes.filter((node) => {
        if (node.id === current.id) return false;
        const primary = horizontal ? node.x - current.x : node.y - current.y;
        return direction === "left" || direction === "up" ? primary < 0 : primary > 0;
      });
      target = candidates.sort((a, b) => {
        const aPrimary = Math.abs((horizontal ? a.x : a.y) - (horizontal ? current.x : current.y));
        const bPrimary = Math.abs((horizontal ? b.x : b.y) - (horizontal ? current.x : current.y));
        const aCross = Math.abs((horizontal ? a.y : a.x) - (horizontal ? current.y : current.x));
        const bCross = Math.abs((horizontal ? b.y : b.x) - (horizontal ? current.y : current.x));
        return aCross - bCross || aPrimary - bPrimary;
      })[0];
    }
    if (!target) return;
    setFocusedNodeId(target.id);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-node-id="${target!.id}"]`)?.focus());
  }, [tree.nodes]);

  return (
    <div className="tc-tree-canvas">
      <svg className="tc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edges.map(([from, to]) => {
          const isDimmed = normalizedQuery !== "" && !matchedNodeIds.has(from.id) && !matchedNodeIds.has(to.id);
          const isLit = !isDimmed && (ranks.get(from.id) ?? 0) > 0 && (ranks.get(to.id) ?? 0) > 0;
          return <line key={`${from.id}-${to.id}`} className={`${isLit ? "is-lit" : ""}${isDimmed ? " is-dimmed" : ""}`.trim() || undefined} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
        })}
      </svg>
      {nodeViews.map((view) => <TalentNodeButton key={view.node.id} view={view} tooltipOpen={tooltipNodeId === view.node.id} tabIndex={focusedNodeId === view.node.id ? 0 : -1} openTooltip={openTreeTooltip} closeTooltip={closeTooltip} onRank={onRank} onCycleChoice={onCycleChoice} onMoveFocus={moveFocus} onFocusNode={setFocusedNodeId} />)}
    </div>
  );
});

function encodeLoadout(ranks: Map<string, number>, choices: ChoiceState, pvp: Array<number | null>) {
  const payload = JSON.stringify({ v: 2, ranks: [...ranks.entries()].sort(([a], [b]) => a.localeCompare(b)), choices: [...choices.entries()].sort(([a], [b]) => a.localeCompare(b)), pvp: pvp.map((id) => id ?? null) });
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeLoadout(value: string) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { v?: unknown; ranks?: unknown; choices?: unknown; pvp?: unknown };
    const ranks = new Map<string, number>();
    const choices = new Map<string, number>();
    if (Array.isArray(parsed.ranks)) parsed.ranks.forEach((entry) => { if (Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(Number(entry[1]))) ranks.set(entry[0], Math.max(0, Number(entry[1]))); });
    if (Array.isArray(parsed.choices)) parsed.choices.forEach((entry) => { if (Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(Number(entry[1]))) choices.set(entry[0], Number(entry[1])); });
    const pvp = Array.isArray(parsed.pvp) ? parsed.pvp.map((value) => value === null ? null : Number.isFinite(Number(value)) ? Math.floor(Number(value)) : null).slice(0, 3) : [];
    return { ranks, choices, pvp };
  } catch {
    return null;
  }
}

type SanitizedLoadout = { ranks: Map<string, number>; choices: ChoiceState; pvp: Array<number | null>; adjusted: boolean };

function removeInvalidDependents(data: TalentCalculatorData, ranks: Map<string, number>, choices: ChoiceState) {
  const nodes = new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node] as const)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...ranks.keys()]) {
      const node = nodes.get(id);
      const treeKind = (Object.keys(data.trees) as TalentKind[]).find((kind) => data.trees[kind].nodes.some((item) => item.id === id));
      if (!node || !treeKind || !nodeAvailability(node, treeKind, ranks, countRanks(ranks, treeKind)).available) {
        ranks.delete(id);
        choices.delete(id);
        changed = true;
      }
    }
  }
}

function sanitizeLoadout(data: TalentCalculatorData, decoded: { ranks: Map<string, number>; choices: ChoiceState; pvp: Array<number | null> }): SanitizedLoadout {
  const nodes = new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node] as const)));
  const ranks = new Map<string, number>();
  decoded.ranks.forEach((value, id) => {
    const node = nodes.get(id);
    const rank = Math.floor(Number(value));
    if (node && Number.isFinite(rank) && rank > 0) ranks.set(id, Math.min(node.maxRanks, rank));
  });
  let adjusted = ranks.size !== decoded.ranks.size;
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, value] of ranks) {
      const node = nodes.get(id);
      if (!node) continue;
      const treeKind = (Object.keys(data.trees) as TalentKind[]).find((kind) => data.trees[kind].nodes.some((item) => item.id === id));
      if (!treeKind || !nodeAvailability(node, treeKind, ranks, countRanks(ranks, treeKind)).available) {
        ranks.delete(id);
        changed = true;
        adjusted = true;
      } else if (value <= 0) {
        ranks.delete(id);
        changed = true;
        adjusted = true;
      }
    }
  }
  const choices = new Map<string, number>();
  decoded.choices.forEach((value, id) => {
    const node = nodes.get(id);
    const choiceId = Math.floor(Number(value));
    if (node?.nodeType === "choice" && (ranks.get(id) ?? 0) > 0 && node.choices.some((choice) => choice.externalId === choiceId)) choices.set(id, choiceId);
  });
  ranks.forEach((rank, id) => {
    const node = nodes.get(id);
    if (node?.nodeType === "choice" && !choices.has(id) && node.choices[0]) choices.set(id, node.choices[0].externalId);
    if (rank <= 0) { ranks.delete(id); adjusted = true; }
  });
  const allowedPvp = new Set(data.pvpTalents.map((talent) => talent.externalId));
  const pvp: Array<number | null> = [null, null, null];
  const used = new Set<number>();
  decoded.pvp.slice(0, 3).forEach((value, index) => {
    if (value !== null && allowedPvp.has(value) && !used.has(value)) { pvp[index] = value; used.add(value); } else if (value !== null) adjusted = true;
  });
  return { ranks, choices, pvp, adjusted };
}

function ErrorState() {
  return <main className="talent-calculator tc-state"><div className="tc-state-card"><span className="tc-state-kicker">Midnight · 12.1.0.69404</span><h1>Дерево талантов недоступно</h1><p>Не удалось получить подтверждённый срез Midnight. Обновите страницу, чтобы повторить запрос.</p></div></main>;
}

export function TalentCalculator({ data }: { data: TalentCalculatorData | null }) {
  const [ranks, setRanks] = useState<Map<string, number>>(new Map());
  const [choices, setChoices] = useState<ChoiceState>(new Map());
  const [pvpSelections, setPvpSelections] = useState<Array<number | null>>([null, null, null]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState(1);
  const [mobileTree, setMobileTree] = useState<TalentKind>("class");
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [loadoutReady, setLoadoutReady] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [invalidLoadout, setInvalidLoadout] = useState(false);
  const [undoState, setUndoState] = useState<{ ranks: Map<string, number>; choices: ChoiceState; pvp: Array<number | null> } | null>(null);
  const [pvpPickerSlot, setPvpPickerSlot] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const tooltipRef = useRef<TooltipState>(null);
  const tooltipCloseTimerRef = useRef<number | null>(null);
  const loadoutMenuRef = useRef<HTMLDivElement>(null);
  const loadoutTriggerRef = useRef<HTMLButtonElement>(null);
  const calculatorRef = useRef<HTMLElement>(null);
  const pvpPickerRef = useRef<HTMLDivElement>(null);
  const pvpSlotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closePvpPicker = useCallback(() => {
    const slot = pvpPickerSlot;
    setPvpPickerSlot(null);
    if (slot !== null) window.requestAnimationFrame(() => pvpSlotRefs.current[slot]?.focus());
  }, [pvpPickerSlot]);

  useEffect(() => {
    if (!data) return;
    const applyUrlLoadout = () => {
      const encoded = new URLSearchParams(window.location.search).get("loadout");
      const decoded = encoded ? decodeLoadout(encoded) : null;
      setInvalidLoadout(Boolean(encoded && !decoded));
      if (encoded && !decoded) setNotice({ message: "Ссылка на сборку повреждена — загружена пустая сборка", persistent: true });
      const next = decoded ? sanitizeLoadout(data, decoded) : { ranks: new Map<string, number>(), choices: new Map<string, number>(), pvp: [null, null, null], adjusted: false };
      if (next.adjusted) setNotice({ message: "Ссылка содержала недоступные таланты — загружены только допустимые ранги", persistent: true });
      setRanks(next.ranks);
      setChoices(next.choices);
      setPvpSelections(next.pvp);
      setLoadoutReady(true);
    };
    applyUrlLoadout();
    window.addEventListener("popstate", applyUrlLoadout);
    return () => window.removeEventListener("popstate", applyUrlLoadout);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (!loadoutReady || invalidLoadout) return;
    const url = new URL(window.location.href);
    if (totalSpent(ranks) > 0 || pvpSelections.some((id) => id !== null)) url.searchParams.set("loadout", encodeLoadout(ranks, choices, pvpSelections)); else url.searchParams.delete("loadout");
    window.history.replaceState({}, "", url);
  }, [choices, data, invalidLoadout, loadoutReady, pvpSelections, ranks]);

  useEffect(() => {
    if (!loadoutOpen) return;
    const items = () => [...document.querySelectorAll<HTMLButtonElement>('#tc-loadout-menu [role="menuitem"]')];
    const focusItem = (index: number) => { const menuItems = items(); if (!menuItems.length) return; menuItems[(index + menuItems.length) % menuItems.length]?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const menuItems = items();
      const current = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); setLoadoutOpen(false); loadoutTriggerRef.current?.focus(); }
      else if (event.key === "Tab") { setLoadoutOpen(false); }
      else if (event.key === "ArrowDown") { event.preventDefault(); focusItem(current + 1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); focusItem(current < 0 ? menuItems.length - 1 : current - 1); }
      else if (event.key === "Home") { event.preventDefault(); focusItem(0); }
      else if (event.key === "End") { event.preventDefault(); focusItem(menuItems.length - 1); }
    };
    const onPointerDown = (event: PointerEvent) => { if (!loadoutMenuRef.current?.contains(event.target as Node)) { setLoadoutOpen(false); loadoutTriggerRef.current?.focus(); } };
    const firstFocus = window.requestAnimationFrame(() => focusItem(0));
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => { window.cancelAnimationFrame(firstFocus); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("pointerdown", onPointerDown); };
  }, [loadoutOpen]);

  useEffect(() => {
    if (!notice) return;
    if (notice.persistent) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeTooltip = () => { tooltipRef.current = null; setTooltip(null); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeTooltip(); };
    const onPointerDown = (event: PointerEvent) => { const target = event.target as Element | null; if (target && !target.closest(".tc-node") && !target.closest(".tc-tooltip") && !target.closest(".tc-pvp-slot") && !target.closest(".tc-pvp-picker")) closeTooltip(); };
    window.addEventListener("scroll", closeTooltip, { capture: true, passive: true });
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => { window.removeEventListener("scroll", closeTooltip, { capture: true }); window.removeEventListener("resize", closeTooltip); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("pointerdown", onPointerDown); };
  }, [pvpPickerSlot]);

  useEffect(() => {
    if (pvpPickerSlot === null) return;
    const calculator = calculatorRef.current;
    const background = calculator ? [...calculator.children].filter((element) => !element.classList.contains("tc-pvp-picker") && !element.classList.contains("tc-pvp-picker-backdrop")) : [];
    background.forEach((element) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    const previousCalculatorOverflow = calculator?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    if (calculator) calculator.style.overflow = "hidden";
    const first = window.requestAnimationFrame(() => pvpPickerRef.current?.querySelector<HTMLButtonElement>("[data-pvp-option]:not([disabled])")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePvpPicker(); return; }
      const picker = pvpPickerRef.current;
      const options = [...(picker?.querySelectorAll<HTMLButtonElement>("[data-pvp-option]:not([disabled])") ?? [])];
      const optionIndex = options.indexOf(document.activeElement as HTMLButtonElement);
      if ((event.key === "ArrowDown" || event.key === "ArrowRight") && optionIndex >= 0) { event.preventDefault(); options[(optionIndex + 1) % options.length]?.focus(); return; }
      if ((event.key === "ArrowUp" || event.key === "ArrowLeft") && optionIndex >= 0) { event.preventDefault(); options[(optionIndex - 1 + options.length) % options.length]?.focus(); return; }
      if (event.key === "Home" && optionIndex >= 0) { event.preventDefault(); options[0]?.focus(); return; }
      if (event.key === "End" && optionIndex >= 0) { event.preventDefault(); options[options.length - 1]?.focus(); return; }
      if (event.key !== "Tab") return;
      const items = [...(picker?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { background.forEach((element) => element.removeAttribute("inert")); document.body.style.overflow = previousOverflow; if (calculator) calculator.style.overflow = previousCalculatorOverflow; window.cancelAnimationFrame(first); window.removeEventListener("keydown", onKeyDown); };
  }, [closePvpPicker, pvpPickerSlot]);

  const changeRank = useCallback((node: TalentNode, direction: 1 | -1) => {
    setInvalidLoadout(false);
    setUndoState(null);
    setRanks((current) => {
      const currentRank = current.get(node.id) ?? 0;
      const next = new Map(current);
      const value = Math.max(0, Math.min(node.maxRanks, (next.get(node.id) ?? 0) + direction));
      if (value === currentRank) return current;
      if (value) next.set(node.id, value); else next.delete(node.id);
      if (direction > 0 && currentRank === 0 && node.nodeType === "choice") setChoices((choiceState) => {
        if (choiceState.has(node.id)) return choiceState;
        const nextChoices = new Map(choiceState);
        if (node.choices[0]) nextChoices.set(node.id, node.choices[0].externalId);
        return nextChoices;
      });
      if (direction < 0) setChoices((choiceState) => {
        const nextChoices = new Map(choiceState);
        if (value === 0) nextChoices.delete(node.id);
        removeInvalidDependents(data!, next, nextChoices);
        return nextChoices;
      });
      return next;
    });
  }, [data]);

  const cycleChoice = useCallback((node: TalentNode, direction: 1 | -1) => {
    setInvalidLoadout(false);
    setUndoState(null);
    if (node.choices.length < 2) return;
    setChoices((current) => {
      const index = Math.max(0, node.choices.findIndex((choice) => choice.externalId === current.get(node.id)));
      const next = new Map(current);
      next.set(node.id, node.choices[(index + direction + node.choices.length) % node.choices.length].externalId);
      return next;
    });
  }, []);

  const matchingTalentCount = useMemo(() => {
    if (!data || !query.trim()) return 0;
    const normalized = query.trim().toLowerCase();
    return Object.values(data.trees).reduce((total, tree) => total + tree.nodes.filter((node) => node.choices.some((choice) => `${choice.name} ${choice.description}`.toLowerCase().includes(normalized))).length, 0);
  }, [data, query]);

  const openTooltip = useCallback<RootOpenTooltip>((node, target, treeKind) => {
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    const rect = target.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = Math.min(460, node.nodeType === "tiered" ? 360 : 170 + node.choices.length * 92);
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
    const top = rect.bottom + 11 + estimatedHeight < window.innerHeight ? rect.bottom + 11 : Math.max(12, rect.top - estimatedHeight - 11);
    const next = { kind: "tree" as const, node, treeKind, left, top };
    tooltipRef.current = next;
    setTooltip(next);
  }, []);

  const openPvpTooltip = useCallback((talent: PvPTalent, target: HTMLButtonElement) => {
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    const rect = target.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = 150;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
    const top = rect.top - estimatedHeight - 11 > 12 ? rect.top - estimatedHeight - 11 : Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 11);
    const next = { kind: "pvp" as const, talent, left, top };
    tooltipRef.current = next;
    setTooltip(next);
  }, []);

  const closeTooltip = useCallback(() => {
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    tooltipCloseTimerRef.current = window.setTimeout(() => { tooltipRef.current = null; setTooltip(null); }, 90);
  }, []);

  const pvpById = useMemo(() => new Map(data?.pvpTalents.map((talent) => [talent.externalId, talent]) ?? []), [data]);
  const openPvpPicker = useCallback((slot: number) => { setTooltip(null); setPvpPickerSlot(slot); }, []);
  const choosePvpTalent = useCallback((externalId: number) => {
    if (pvpPickerSlot === null || !pvpById.has(externalId)) return;
    if (pvpSelections.some((id, index) => id === externalId && index !== pvpPickerSlot)) { setNotice({ message: "Этот PvP-талант уже выбран в другом слоте" }); return; }
    setInvalidLoadout(false); setUndoState(null);
    setPvpSelections((current) => current.map((id, index) => index === pvpPickerSlot ? externalId : id));
    const slot = pvpPickerSlot;
    setPvpPickerSlot(null);
    window.requestAnimationFrame(() => pvpSlotRefs.current[slot]?.focus());
  }, [pvpById, pvpPickerSlot, pvpSelections]);
  const clearPvpTalent = useCallback((slot: number) => {
    setInvalidLoadout(false); setUndoState(null); setPvpSelections((current) => current.map((id, index) => index === slot ? null : id));
  }, []);

  if (!data) return <ErrorState />;
  if (!loadoutReady) return <main className="talent-calculator tc-state" aria-busy="true"><div className="tc-state-card tc-loading-card"><span className="tc-loading-orb" aria-hidden="true" /><span className="tc-state-kicker">Midnight · {data.buildVersion}</span><h1>Загрузка сборки</h1><p>Проверяем таланты и восстанавливаем сохранённые очки.</p></div></main>;

  const totalAvailable = Object.values(data.trees).reduce((sum, tree) => sum + tree.totalRanks, 0);
  const spent = totalSpent(ranks);
  const rank = (kind: TalentKind) => countRanks(ranks, kind);

  const showNotice = (message: string, persistent = false) => setNotice({ message, persistent });
  const reset = () => {
    if (spent === 0 && !pvpSelections.some((id) => id !== null)) { setLoadoutOpen(false); return; }
    setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
    setInvalidLoadout(false); setRanks(new Map()); setChoices(new Map()); setPvpSelections([null, null, null]); showNotice("Таланты сброшены — можно отменить", true); setLoadoutOpen(false);
  };
  const undoReset = () => { if (!undoState) return; setRanks(new Map(undoState.ranks)); setChoices(new Map(undoState.choices)); setPvpSelections([...undoState.pvp]); setUndoState(null); showNotice("Сборка восстановлена"); };
  const copyText = async (value: string, success: string) => { try { if (!navigator.clipboard) throw new Error("Clipboard API unavailable"); await navigator.clipboard.writeText(value); showNotice(success); } catch { showNotice("Не удалось скопировать — проверьте разрешения браузера", true); } setLoadoutOpen(false); };
  const copyShareLink = async () => copyText(window.location.href, "Ссылка на сборку скопирована");
  const copyJson = async () => copyText(JSON.stringify({ v: 2, build: data.buildVersion, ranks: [...ranks.entries()], choices: [...choices.entries()], pvp: pvpSelections }, null, 2), "JSON сборки скопирован");

  const tabs = [
    { src: "/assets/classes/warrior.jpg", label: "Воин", available: false }, { src: "/assets/specs/fury-warrior.jpg", label: "Неистовство", available: true }, { src: "/assets/specs/arms-warrior.jpg", label: "Оружие", available: false }, { src: "/assets/specs/ret-paladin.jpg", label: "Паладин", available: false }, { src: "/assets/specs/outlaw-rogue.jpg", label: "Разбойник", available: false }, { src: "/assets/specs/fire-mage.jpg", label: "Маг", available: false }, { src: "/assets/specs/arcane-mage.jpg", label: "Аркан", available: false }, { src: "/assets/specs/ele-shaman.jpg", label: "Шаман", available: false }, { src: "/assets/specs/aff-lock.jpg", label: "Чернокнижник", available: false },
  ];
  const activeTreeTooltipId = tooltip?.kind === "tree" ? tooltip.node.id : undefined;
  const activePvpTalent = pvpPickerSlot === null ? null : pvpById.get(pvpSelections[pvpPickerSlot] ?? -1);

  return (
    <main ref={calculatorRef} className="talent-calculator">
      <h1 className="sr-only">Калькулятор талантов World of Warcraft: Midnight — Воин, Неистовство</h1>
      <div className="tc-frame-corner tc-corner-tl" /><div className="tc-frame-corner tc-corner-tr" /><div className="tc-frame-corner tc-corner-bl" /><div className="tc-frame-corner tc-corner-br" />
      <header className="tc-header">
        <div className="tc-brand-lockup"><Image className="tc-brand-mark" src="/brand/helmet.png" alt="" width={25} height={25} /><span>GILDRA</span></div>
        <div className="tc-tab-rail" role="group" aria-label="Специализации">
          {tabs.map((tab, index) => <button className={`tc-tab ${activeTab === index ? "is-active" : ""}`} key={tab.label} type="button" aria-pressed={activeTab === index} aria-disabled={!tab.available} tabIndex={tab.available ? 0 : -1} title={tab.available ? tab.label : `${tab.label} · скоро`} onClick={() => { if (tab.available) setActiveTab(index); }}><Image src={tab.src} alt={tab.label} width={34} height={34} /></button>)}
        </div>
        <div className="tc-build-badge" title={`Срез данных Midnight ${data.buildVersion}; hotfix: ${midnightManifest.hotfixThrough ?? "не подтверждены"}`}><span>СРЕЗ MIDNIGHT</span><b>{data.buildVersion}</b></div>
      </header>
      <section className="tc-column-heads" aria-label="Деревья талантов">
        <div className="tc-column-head tc-class-head"><div className="tc-head-title"><Image src="/assets/classes/warrior.jpg" alt="" width={28} height={28} />{data.className}</div><div className="tc-head-meta"><span>Потрачено: <b>{rank("class")}</b> / {data.trees.class.totalRanks}</span><span>Треб. уровень: 10</span></div></div>
        <div className="tc-column-head tc-hero-head"><div className="tc-head-title">Герой</div><div className="tc-head-meta"><span>Потрачено: <b>{rank("hero")}</b> / {data.trees.hero.totalRanks}</span><span>Треб. уровень: 71</span></div></div>
        <div className="tc-column-head tc-spec-head"><div className="tc-head-title"><Image src="/assets/specs/fury-warrior.jpg" alt="" width={28} height={28} />{data.specName}</div><div className="tc-head-meta"><span>Потрачено: <b>{rank("spec")}</b> / {data.trees.spec.totalRanks}</span><span>Треб. уровень: 11</span></div></div>
      </section>
      <div className="tc-mobile-tree-switcher" role="group" aria-label="Выбор дерева талантов">
        {([['class', data.className], ['hero', data.heroName], ['spec', data.specName]] as const).map(([kind, label]) => <button key={kind} type="button" aria-pressed={mobileTree === kind} onClick={() => setMobileTree(kind)}>{label}</button>)}
      </div>
      <section className="tc-workspace" data-mobile-tree={mobileTree}>
        <article className="tc-panel tc-class-panel"><TalentTreeView tree={data.trees.class} ranks={ranks} choices={choices} onRank={changeRank} onCycleChoice={cycleChoice} query={query} tooltipNodeId={tooltip?.kind === "tree" && tooltip.treeKind === "class" ? activeTreeTooltipId : undefined} openTooltip={openTooltip} closeTooltip={closeTooltip} /></article>
        <article className="tc-panel tc-hero-panel"><div className="tc-hero-title">{data.heroName}</div><div className="tc-hero-medallion"><img src={data.heroIconUrl} alt="" onError={(event) => { event.currentTarget.src = "/assets/specs/fury-warrior.jpg"; }} /></div><TalentTreeView tree={data.trees.hero} ranks={ranks} choices={choices} onRank={changeRank} onCycleChoice={cycleChoice} query={query} tooltipNodeId={tooltip?.kind === "tree" && tooltip.treeKind === "hero" ? activeTreeTooltipId : undefined} openTooltip={openTooltip} closeTooltip={closeTooltip} /></article>
        <article className="tc-panel tc-spec-panel"><TalentTreeView tree={data.trees.spec} ranks={ranks} choices={choices} onRank={changeRank} onCycleChoice={cycleChoice} query={query} tooltipNodeId={tooltip?.kind === "tree" && tooltip.treeKind === "spec" ? activeTreeTooltipId : undefined} openTooltip={openTooltip} closeTooltip={closeTooltip} /></article>
      </section>
      <footer className="tc-toolbar">
        <div className="tc-toolbar-group tc-toolbar-primary">
          <div className="tc-loadout-menu" ref={loadoutMenuRef}>
            <button ref={loadoutTriggerRef} className="tc-import" type="button" aria-label="Сборка — открыть меню" aria-haspopup="menu" aria-controls="tc-loadout-menu" aria-expanded={loadoutOpen} title="Открыть меню сборки" onClick={() => setLoadoutOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setLoadoutOpen(true); } }}><Image className="tc-horde-mark" src="/brand/helmet.png" alt="" width={20} height={20} /><span>Сборка</span><span className="tc-caret">⌄</span></button>
          {loadoutOpen ? <div className="tc-loadout-popover" id="tc-loadout-menu" role="menu" aria-label="Действия со сборкой"><button type="button" role="menuitem" tabIndex={-1} onClick={() => void copyShareLink()}>Копировать ссылку</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => void copyJson()}>Экспортировать JSON</button><button type="button" role="menuitem" tabIndex={-1} onClick={reset}>Сбросить таланты</button></div> : null}
          </div>
          <div className="tc-search"><label htmlFor="tc-search-input"><span aria-hidden="true">⌕</span><span className="sr-only">Поиск талантов</span></label><input id="tc-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по талантам" />{query && <span className="tc-search-count" aria-live="polite">{matchingTalentCount}</span>}{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}>×</button>}</div>
        </div>
        <div className="tc-toolbar-spacer" /><div className="tc-pvp-group" role="group" aria-labelledby="tc-pvp-label"><span className="tc-pvp-label" id="tc-pvp-label">PvP-таланты:</span>{[0, 1, 2].map((slot) => { const talent = pvpById.get(pvpSelections[slot] ?? -1); const slotTooltipId = tooltip?.kind === "pvp" && talent && tooltip.talent.externalId === talent.externalId ? `tooltip-pvp-${talent.externalId}` : undefined; return <button className={`tc-pvp-slot${talent ? " is-filled" : ""}`} key={slot} ref={(element) => { pvpSlotRefs.current[slot] = element; }} type="button" data-pvp-slot={slot} data-pvp-id={talent?.externalId} aria-label={`PvP-талант ${slot + 1}: ${talent?.name ?? "не выбран"}`} aria-describedby={slotTooltipId} aria-haspopup="dialog" aria-controls={pvpPickerSlot === null ? undefined : "tc-pvp-picker"} aria-expanded={pvpPickerSlot === slot} onMouseEnter={(event) => { if (talent) openPvpTooltip(talent, event.currentTarget); }} onMouseLeave={closeTooltip} onFocus={(event) => { if (talent) openPvpTooltip(talent, event.currentTarget); }} onBlur={closeTooltip} onClick={() => openPvpPicker(slot)}>{talent?.iconUrl ? <img src={talent.iconUrl} alt="" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = "/assets/classes/warrior.jpg"; event.currentTarget.dataset.iconSource = "fallback"; }} /> : <span>+</span>}<small>{slot + 1}</small></button>; })}</div>
        <div className="tc-toolbar-summary"><span className="tc-total-points">{plural(spent, "очко", "очка", "очков")} / {totalAvailable} · {plural(ranks.size, "узел", "узла", "узлов")}</span><span className="tc-shortcut">ЛКМ — добавить · ПКМ — снять</span></div>
        {notice ? <div className="tc-toast" role="status" aria-live="polite"><span>{notice.message}</span>{undoState ? <button type="button" onClick={undoReset}>Отменить</button> : null}{notice.persistent ? <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice(null)}>×</button> : null}</div> : null}
      </footer>
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker-backdrop" aria-hidden="true" onClick={closePvpPicker} /> : null}
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker" id="tc-pvp-picker" ref={pvpPickerRef} role="dialog" aria-modal="true" aria-labelledby="tc-pvp-picker-title"><div className="tc-pvp-picker-head"><div><span className="tc-state-kicker">Midnight · Fury</span><h2 id="tc-pvp-picker-title">{activePvpTalent ? "Заменить PvP-талант" : "Выбрать PvP-талант"}</h2></div><button type="button" className="tc-pvp-close" aria-label="Закрыть выбор PvP-таланта" onClick={closePvpPicker}>×</button></div><p className="tc-pvp-picker-hint">Слот {pvpPickerSlot + 1} · можно выбрать один раз каждый талант</p><div className="tc-pvp-options" role="listbox" aria-label="PvP-таланты Fury">{data.pvpTalents.map((talent) => { const selectedSlot = pvpSelections.findIndex((id) => id === talent.externalId); const selectedHere = selectedSlot === pvpPickerSlot; const disabled = selectedSlot >= 0 && !selectedHere; const firstAvailable = data.pvpTalents.find((item) => !pvpSelections.some((id, slotIndex) => id === item.externalId && slotIndex !== pvpPickerSlot))?.externalId; const optionTooltipId = tooltip?.kind === "pvp" && tooltip.talent.externalId === talent.externalId ? `tooltip-pvp-${talent.externalId}` : undefined; return <button key={talent.externalId} type="button" data-pvp-option="true" data-pvp-picker-id={talent.externalId} role="option" tabIndex={!disabled && talent.externalId === firstAvailable ? 0 : -1} aria-selected={selectedHere} aria-describedby={optionTooltipId} disabled={disabled} title={disabled ? `Уже выбран в слоте ${selectedSlot + 1}` : talent.name} onMouseEnter={(event) => openPvpTooltip(talent, event.currentTarget)} onMouseLeave={closeTooltip} onFocus={(event) => openPvpTooltip(talent, event.currentTarget)} onBlur={closeTooltip} onClick={() => choosePvpTalent(talent.externalId)}><img src={talent.iconUrl || "/assets/classes/warrior.jpg"} alt="" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = "/assets/classes/warrior.jpg"; event.currentTarget.dataset.iconSource = "fallback"; }} /><span><strong>{talent.name}</strong><small>{talent.description}</small></span>{selectedHere ? <b aria-hidden="true">✓</b> : disabled ? <em>Слот {selectedSlot + 1}</em> : null}</button>; })}</div><button type="button" className="tc-pvp-clear" data-pvp-remove="true" onClick={() => { clearPvpTalent(pvpPickerSlot); closePvpPicker(); }} disabled={!activePvpTalent}>Убрать талант из слота</button></div> : null}
      {tooltip?.kind === "tree" ? <Tooltip node={tooltip.node} left={tooltip.left} top={tooltip.top} selectedChoice={choices.get(tooltip.node.id)} lockReason={nodeAvailability(tooltip.node, tooltip.treeKind, ranks, countRanks(ranks, tooltip.treeKind)).reason} id={`tooltip-${tooltip.node.id}`} /> : null}
      {tooltip?.kind === "pvp" ? <PvpTooltip talent={tooltip.talent} left={tooltip.left} top={tooltip.top} selected={pvpSelections.includes(tooltip.talent.externalId)} id={`tooltip-pvp-${tooltip.talent.externalId}`} /> : null}
    </main>
  );
}
