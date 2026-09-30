"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, CircleDot, Crosshair, Download, Droplets, Eye, Flame, Leaf, LockKeyhole, PawPrint, Plus, RotateCcw, Save, Search, Share2, Shield, Skull, Snowflake, Sparkles, Sun, Swords, Trash2, Undo2, Upload, UserRound, Waves, X, Zap } from "lucide-react";
import { createElement, forwardRef, memo, startTransition, useCallback, useDeferredValue, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { PvPTalent, TalentCalculatorData, TalentChoice, TalentNode, TalentTree, TalentKind } from "@/lib/talentCalculatorData";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { pvpVisualTheme, talentVisualTheme } from "@/lib/talentVisualTheme";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, FURY_REFERENCE_LOADOUT, TALENT_HANDOFF_STORAGE_KEY, talentPointBudgets } from "@/lib/wowTalentLoadout";
import { SpecMenu } from "@/components/talents/SpecMenuLazy";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { TalentDescription } from "@/components/talents/TalentDescription";
import { getPerformanceTier, type PerformanceTier } from "@/lib/client/performanceTier";
import { navigateTalentPage } from "@/lib/client/viewTransitionNavigation";

const SpecSignatureFx = dynamic(
  () => import("@/components/talents/spec-signature/SpecSignatureFx").then((module) => module.SpecSignatureFx),
  { ssr: false },
);

type TooltipPlacement = "above" | "below";
type TooltipMotion = "open" | "closing";
type TooltipState = { kind: "tree"; node: TalentNode; treeKind: TalentKind; left: number; top: number; anchorOffset: number; placement: TooltipPlacement } | { kind: "pvp"; talent: PvPTalent; left: number; top: number; anchorOffset: number; placement: TooltipPlacement } | null;
type TreeTooltipState = Exclude<TooltipState, null> & { kind: "tree" };
type PvpTooltipState = Exclude<TooltipState, null> & { kind: "pvp" };
type TreeTooltipLayerHandle = { show: (tooltip: TreeTooltipState) => void; close: () => void; clear: () => void };
type ChoiceState = Map<string, number>;
type Notice = { message: string; persistent?: boolean } | null;
type OpenTooltip = (node: TalentNode, target: HTMLButtonElement, immediate?: boolean, delayMs?: number) => void;
type RootOpenTooltip = (node: TalentNode, target: HTMLButtonElement, treeKind: TalentKind, immediate?: boolean, delayMs?: number) => void;

type SavedTalentBuild = { id: string; name: string; loadout: string; savedAt: string; buildVersion: string };

function sameSavedBuilds(left: SavedTalentBuild[], right: SavedTalentBuild[]) {
  return left.length === right.length && left.every((build, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && build.id === candidate.id
      && build.name === candidate.name
      && build.loadout === candidate.loadout
      && build.savedAt === candidate.savedAt
      && build.buildVersion === candidate.buildVersion;
  });
}

const TALENT_SAVED_BUILD_STORAGE_KEY = "gildra:talents:saved-build:v1";
const TALENT_BUILD_LIBRARY_STORAGE_KEY = "gildra:talents:build-library:v2";
const TALENT_ACTIVE_BUILD_STORAGE_KEY = "gildra:talents:active-build:v2";
const UNVERIFIED_ICON_URL = "/assets/wow/icon-unverified.svg";

const buildLibraryKey = (specSlug: string) => `${TALENT_BUILD_LIBRARY_STORAGE_KEY}:${specSlug}`;
const activeBuildKey = (specSlug: string) => `${TALENT_ACTIVE_BUILD_STORAGE_KEY}:${specSlug}`;

function createBuildId(specSlug: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${specSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readBuildLibrary(specSlug: string, defaultName: string): SavedTalentBuild[] {
  try {
    const raw = window.localStorage.getItem(buildLibraryKey(specSlug));
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.filter((build): build is SavedTalentBuild => Boolean(build && typeof build.id === "string" && typeof build.name === "string" && typeof build.loadout === "string" && typeof build.savedAt === "string" && typeof build.buildVersion === "string")).slice(0, 24);
    if (specSlug !== "fury-warrior") return [];
    const legacyRaw = window.localStorage.getItem(TALENT_SAVED_BUILD_STORAGE_KEY);
    if (!legacyRaw) return [];
    const legacy = JSON.parse(legacyRaw) as { name?: unknown; loadout?: unknown; savedAt?: unknown; buildVersion?: unknown };
    if (typeof legacy.loadout !== "string") return [];
    const migrated: SavedTalentBuild = {
      id: createBuildId(specSlug),
      name: typeof legacy.name === "string" && legacy.name.trim() ? legacy.name.trim().slice(0, 48) : defaultName,
      loadout: legacy.loadout,
      savedAt: typeof legacy.savedAt === "string" ? legacy.savedAt : new Date().toISOString(),
      buildVersion: typeof legacy.buildVersion === "string" ? legacy.buildVersion : "legacy",
    };
    window.localStorage.setItem(buildLibraryKey(specSlug), JSON.stringify([migrated]));
    window.localStorage.setItem(activeBuildKey(specSlug), migrated.id);
    return [migrated];
  } catch {
    return [];
  }
}

function readActiveBuildId(specSlug: string) {
  try { return window.localStorage.getItem(activeBuildKey(specSlug)); }
  catch { return null; }
}

const furyEffectPalette: Record<string, { core: string; hot: string }> = {
  blood: { core: "#bd1717", hot: "#ff6b45" },
  steel: { core: "#b8aa97", hot: "#fff2d8" },
  fury: { core: "#e52e19", hot: "#ff9a45" },
  fire: { core: "#f04b1f", hot: "#ffd064" },
  storm: { core: "#e87b35", hot: "#fff1b8" },
  charge: { core: "#d84a25", hot: "#ffbb70" },
  guard: { core: "#9b8870", hot: "#f5d6a2" },
  warcry: { core: "#d92f1d", hot: "#ffcb82" },
};

function playTalentBurst(target: HTMLButtonElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const restingScale = target.matches(":hover") ? 1.12 : 1;
  target.animate([
    { transform: `translate(-50%,-50%) scale(${restingScale})` },
    { transform: "translate(-50%,-50%) scale(.84)", offset: 0.18 },
    { transform: "translate(-50%,-50%) scale(1.24)", offset: 0.52 },
    { transform: `translate(-50%,-50%) scale(${restingScale})` },
  ], { duration: 250, easing: "cubic-bezier(.16,.86,.22,1)", composite: "replace" });
}

const scheduledTalentBursts = new WeakSet<HTMLButtonElement>();

function scheduleTalentBurst(target: HTMLButtonElement) {
  // Let the rank change render and paint before the decorative effects do work.
  // Coalesce repeat clicks on the same node while an effect is queued.
  if (scheduledTalentBursts.has(target)) return;
  scheduledTalentBursts.add(target);
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      scheduledTalentBursts.delete(target);
      if (target.isConnected) playTalentBurst(target);
    }, 0);
  });
}

function scheduleWhenIdle(callback: () => void, timeout: number) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(callback, 250);
  return () => window.clearTimeout(handle);
}

function playPvpBurst(target: HTMLButtonElement, action: "equip" | "remove" = "equip") {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const performanceTier = getPerformanceTier();
  const root = target.closest<HTMLElement>(".talent-calculator");
  const sigil = target.querySelector<SVGElement>(".tc-node-sigil");
  const icon = target.querySelector<HTMLElement>("img");
  const theme = target.dataset.pvpTheme || "fury";
  const fallbackPalette = furyEffectPalette[theme] || furyEffectPalette.fury;
  const rootStyle = root ? getComputedStyle(root) : null;
  const palette = {
    core: rootStyle?.getPropertyValue("--tc-accent").trim() || fallbackPalette.core,
    hot: rootStyle?.getPropertyValue("--tc-hot").trim() || fallbackPalette.hot,
  };
  const rect = target.getBoundingClientRect();
  const originX = Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2));
  const originY = Math.max(80, Math.min(window.innerHeight - 80, rect.top + rect.height / 2));
  const direction = action === "remove" ? -1 : 1;

  target.getAnimations().forEach((animation) => animation.cancel());
  target.animate([
    { transform: "translateY(0) scale(1) rotate(0deg)" },
    { transform: `translateY(${direction * -3}px) scale(${action === "equip" ? 1.24 : 0.82}) rotate(${direction * -4}deg)`, offset: 0.34 },
    { transform: "translateY(0) scale(1.04) rotate(2deg)", offset: 0.68 },
    { transform: "translateY(0) scale(1) rotate(0deg)" },
  ], { duration: 430, easing: "cubic-bezier(.12,.82,.2,1)", composite: "replace" });
  if (performanceTier === "minimal") return;
  icon?.animate(action === "equip" ? [
    { filter: "brightness(.7) saturate(.8)", transform: "scale(.72)" },
    { filter: "brightness(1.75) saturate(1.55)", transform: "scale(1.18)", offset: 0.42 },
    { filter: "brightness(1) saturate(1)", transform: "scale(1)" },
  ] : [
    { filter: "brightness(1) saturate(1)", opacity: 1, transform: "scale(1)" },
    { filter: "brightness(1.8) saturate(.2)", opacity: 0, transform: "scale(.62) rotate(-9deg)" },
  ], { duration: 390, easing: "cubic-bezier(.16,.8,.2,1)", composite: "replace" });
  sigil?.animate([
    { opacity: 0.24, transform: "rotate(var(--tc-sigil-rotation)) scale(.55)" },
    { opacity: 1, transform: `rotate(calc(var(--tc-sigil-rotation) + ${direction * 54}deg)) scale(1.58)`, offset: 0.42 },
    { opacity: action === "equip" ? 0.76 : 0, transform: "rotate(var(--tc-sigil-rotation)) scale(1)" },
  ], { duration: 560, easing: "cubic-bezier(.12,.82,.2,1)", composite: "replace" });

  if (!root) return;
  const shock = document.createElement("span");
  shock.className = `tc-pvp-shock tc-pvp-shock-${theme}${action === "remove" ? " is-remove" : ""}`;
  shock.style.left = `${originX}px`;
  shock.style.top = `${originY}px`;
  shock.style.setProperty("--tc-impact-core", palette.core);
  shock.style.setProperty("--tc-impact-hot", palette.hot);
  root.appendChild(shock);
  const effects: Animation[] = [shock.animate([
    { opacity: 0.16, transform: "translate(-50%,-50%) scale(.18)" },
    { opacity: 1, transform: "translate(-50%,-50%) scale(.82)", offset: 0.3 },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.46)" },
  ], { duration: 610, easing: "cubic-bezier(.12,.76,.18,1)" })];

  if (performanceTier === "full" && sigil) {
    const impactSigil = sigil.cloneNode(true) as SVGElement;
    impactSigil.classList.remove("tc-node-sigil");
    impactSigil.classList.add("tc-pvp-impact-sigil");
    impactSigil.style.left = `${originX}px`;
    impactSigil.style.top = `${originY}px`;
    impactSigil.style.setProperty("--tc-impact-core", palette.core);
    impactSigil.style.setProperty("--tc-impact-hot", palette.hot);
    root.appendChild(impactSigil);
    const rotation = Number.parseFloat(getComputedStyle(sigil).getPropertyValue("--tc-sigil-rotation")) || 0;
    const animation = impactSigil.animate([
      { opacity: 0.12, transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.28)` },
      { opacity: 1, transform: `translate(-50%,-50%) rotate(${rotation + direction * 82}deg) scale(1.08)`, offset: 0.38 },
      { opacity: 0, transform: `translate(-50%,-50%) rotate(${rotation + direction * 118}deg) scale(1.52)` },
    ], { duration: 650, easing: "cubic-bezier(.12,.78,.18,1)" });
    effects.push(animation);
    animation.finished.finally(() => impactSigil.remove());
  }

  const particleTotal = performanceTier === "full" ? 10 : 4;
  for (let index = 0; index < particleTotal; index += 1) {
    const particle = document.createElement("i");
    const angle = ((index * 36 + Number(target.dataset.pvpId || 0) % 31) * Math.PI) / 180;
    const distance = 38 + (index % 3) * 9;
    shock.appendChild(particle);
    effects.push(particle.animate([
      { opacity: 0.2, transform: "translate(-50%,-50%) scale(.2)" },
      { opacity: 1, offset: 0.18 },
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px),calc(-50% + ${Math.sin(angle) * distance}px)) scale(.3) rotate(${Math.round(angle * 180 / Math.PI)}deg)` },
    ], { duration: 420 + (index % 3) * 45, delay: index * 7, easing: "cubic-bezier(.14,.72,.2,1)" }));
  }
  Promise.allSettled(effects.map((animation) => animation.finished)).finally(() => shock.remove());
}

function countRanks(ranks: Map<string, number>, kind: TalentKind, nodes?: TalentNode[]) {
  const free = new Set(nodes?.filter((node) => node.freeNode).map((node) => node.id) ?? []);
  return [...ranks.entries()].filter(([id]) => id.startsWith(`${kind}-`) && !free.has(id)).reduce((sum, [, value]) => sum + value, 0);
}

function countRanksByTree(ranks: Map<string, number>, data?: TalentCalculatorData | null): Record<TalentKind, number> {
  const totals: Record<TalentKind, number> = { class: 0, hero: 0, spec: 0 };
  if (!data) {
    for (const [id, value] of ranks) {
      const kind = id.split("-", 1)[0] as TalentKind;
      if (kind in totals) totals[kind] += value;
    }
    return totals;
  }

  for (const kind of ["class", "hero", "spec"] as const) {
    for (const node of data.trees[kind].nodes) {
      if (!node.freeNode) totals[kind] += ranks.get(node.id) ?? 0;
    }
  }
  return totals;
}

function freeTalentRanks(data: TalentCalculatorData) {
  return new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.filter((node) => node.freeNode).map((node) => [node.id, node.maxRanks] as const)));
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

type TalentNodeCatalog = Map<number, TalentNode[]>;
type TalentSearchIndex = Map<string, string[]>;
type CachedTalentSearchIndex = { data: TalentCalculatorData; index: TalentSearchIndex };
type NodeAvailability = { available: boolean; reason: string; blockerNodeIds: string[] };
type CachedTalentNodeView = {
  view: TalentNodeView;
  node: TalentNode;
  rank: number;
  selectedChoice?: number;
  ranks: Map<string, number>;
  nodeCatalog: TalentNodeCatalog;
  spentInTree: number;
  treeKind: TalentKind;
  pointGate: number;
  requiredRanks: string;
  previousRanks: string;
  hasMatch: boolean;
};

function createTalentNodeCatalog(data: TalentCalculatorData | null | undefined) {
  const catalog: TalentNodeCatalog = new Map();
  if (!data) return catalog;
  Object.values(data.trees).flatMap((tree) => tree.nodes).forEach((node) => {
    catalog.set(node.nodeId, [...(catalog.get(node.nodeId) ?? []), node]);
  });
  return catalog;
}

function mapsHaveSameValues<K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>) {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (!right.has(key) || !Object.is(right.get(key), value)) return false;
  }
  return true;
}

function talentNodeName(node: TalentNode) {
  const names = [...new Set(node.choices.map((choice) => choice.name).filter(Boolean))];
  return names.join(" / ") || `талант #${node.nodeId}`;
}

function catalogNodes(catalog: TalentNodeCatalog, nodeIds: number[], treeKind?: TalentKind) {
  return nodeIds.flatMap((nodeId) => catalog.get(nodeId) ?? []).filter((node) => !treeKind || node.id.startsWith(`${treeKind}-`));
}

function talentRequirementRankSignature(nodeIds: number[], catalog: TalentNodeCatalog, ranks: Map<string, number>, treeKind?: TalentKind) {
  let signature = "";
  for (const nodeId of nodeIds) {
    for (const node of catalog.get(nodeId) ?? []) {
      if (treeKind && !node.id.startsWith(`${treeKind}-`)) continue;
      signature += `${node.id}:${ranks.get(node.id) ?? 0};`;
    }
  }
  return signature;
}

function unmetTalentRequirement(nodes: TalentNode[], fallbackIds: number[], ranks: Map<string, number>) {
  if (nodes.some((candidate) => (ranks.get(candidate.id) ?? 0) > 0)) return null;
  const names = [...new Set(nodes.map(talentNodeName))];
  const fallbackNames = fallbackIds.map((nodeId) => `талант #${nodeId}`);
  const labels = names.length ? names : fallbackNames;
  return {
    nodeIds: nodes.map((candidate) => candidate.id),
    text: labels.length === 1 ? `Выберите «${labels[0]}»` : `Выберите один из: ${labels.map((name) => `«${name}»`).join(", ")}`,
  };
}

function nodeAvailability(node: TalentNode, treeKind: TalentKind, ranks: Map<string, number>, spentInTree: number, catalog: TalentNodeCatalog): NodeAvailability {
  const currentRank = ranks.get(node.id) ?? 0;
  const spentBeforeNode = Math.max(0, spentInTree - currentRank);
  if (node.freeNode) return { available: true, reason: "", blockerNodeIds: [] };

  const reasons: string[] = [];
  const blockerNodeIds = new Set<string>();
  if (node.requiredPoints && spentBeforeNode < node.requiredPoints) reasons.push(`Потратьте ещё ${node.requiredPoints - spentBeforeNode} очк. в этом дереве`);

  if (node.requiresNodeIds.length) {
    const requirement = unmetTalentRequirement(catalogNodes(catalog, node.requiresNodeIds), node.requiresNodeIds, ranks);
    if (requirement) {
      reasons.push(requirement.text);
      requirement.nodeIds.forEach((nodeId) => blockerNodeIds.add(nodeId));
    }
  }

  if (node.prevNodeIds.length) {
    const requirement = unmetTalentRequirement(catalogNodes(catalog, node.prevNodeIds, treeKind), node.prevNodeIds, ranks);
    if (requirement) {
      reasons.push(requirement.text);
      requirement.nodeIds.forEach((nodeId) => blockerNodeIds.add(nodeId));
    }
  }

  return reasons.length
    ? { available: false, reason: reasons.join(" · "), blockerNodeIds: [...blockerNodeIds] }
    : { available: true, reason: "", blockerNodeIds: [] };
}

const treeLabels: Record<TalentKind, string> = {
  class: "Дерево класса",
  hero: "Путь героя",
  spec: "Специализация",
};

function Tooltip({ node, treeKind, left, top, anchorOffset, placement, motion, id, selectedChoice, currentRank, lockReason }: { node: TalentNode; treeKind: TalentKind; left: number; top: number; anchorOffset: number; placement: TooltipPlacement; motion: TooltipMotion; id: string; selectedChoice?: number; currentRank: number; lockReason?: string }) {
  const isSelected = currentRank > 0;
  const interactionLabel = node.nodeType === "choice" && currentRank >= node.maxRanks ? "Сменить вариант" : currentRank < node.maxRanks ? "Добавить ранг" : "Максимальный ранг";
  return (
    <aside className={`tc-tooltip tc-tooltip-${node.talentType}${lockReason ? " is-locked" : isSelected ? " is-selected" : ""}${motion === "closing" ? " is-closing" : ""}`} id={id} role="tooltip" data-motion={motion} data-placement={placement} aria-hidden={motion === "closing" ? true : undefined} style={{ left, top, "--tc-tooltip-anchor": `${anchorOffset}px` } as CSSProperties}>
      <span className="tc-tooltip-backplate" aria-hidden="true" />
      <span className="tc-tooltip-forge-line" aria-hidden="true" />
      <div className="tc-tooltip-meta"><span>{treeLabels[treeKind]}</span><span>Узел #{node.nodeId}</span></div>
      {node.nodeType === "tiered"
        ? <TalentTieredTooltip node={node} />
        : node.choices.map((choice, index) => <TalentTooltipChoice choice={choice} key={choice.externalId} index={index} showChoice={node.nodeType === "choice"} tiered={false} selected={selectedChoice === choice.externalId} />)}
      <div className="tc-tooltip-state">
        <span className="tc-tooltip-rank"><small>Текущий ранг</small><b>{currentRank}<i> / {node.maxRanks}</i></b></span>
        <span className={lockReason ? "is-danger" : isSelected ? "is-ready" : "is-available"}>{lockReason ? <LockKeyhole /> : isSelected ? <Check /> : <Sparkles />}<span>{lockReason ? "Недоступно" : isSelected ? "Выбрано" : "Можно изучить"}</span></span>
      </div>
      {lockReason ? <div className="tc-tooltip-lock"><LockKeyhole /><span><b>Как открыть талант</b><small>{lockReason}</small><i>Нужные узлы подсвечены на дереве</i></span></div> : null}
      <div className="tc-tooltip-controls" aria-hidden="true"><span><kbd>ЛКМ</kbd>{interactionLabel}</span><span><kbd>ПКМ</kbd>Убрать ранг</span>{node.nodeType === "choice" ? <span><kbd>[ / ]</kbd>Вариант</span> : null}</div>
      <div className="tc-tooltip-foot"><span>Midnight · {node.talentType === "active" ? "заклинание" : "талант"}</span><span>{node.freeNode ? "Изучен автоматически" : `Требуется очков: ${node.requiredPoints ?? 0}`}</span></div>
    </aside>
  );
}

function PvpTooltip({ talent, left, top, anchorOffset, placement, motion, id, selected }: { talent: PvPTalent; left: number; top: number; anchorOffset: number; placement: TooltipPlacement; motion: TooltipMotion; id: string; selected: boolean }) {
  const iconSource = talent.iconSource === "fallback" ? "Локальная замена" : "Blizzard Render / DB2";
  return <aside className={`tc-tooltip tc-pvp-tooltip${selected ? " is-selected" : ""}${motion === "closing" ? " is-closing" : ""}`} id={id} role="tooltip" data-motion={motion} data-placement={placement} aria-hidden={motion === "closing" ? true : undefined} style={{ left, top, "--tc-tooltip-anchor": `${anchorOffset}px` } as CSSProperties}>
    <span className="tc-tooltip-backplate" aria-hidden="true" />
    <span className="tc-tooltip-forge-line" aria-hidden="true" />
    <div className="tc-tooltip-meta"><span>Арена и поля боя</span><span>PvP #{talent.externalId}</span></div>
    <div className="tc-tooltip-choice is-selected">
      <div className="tc-tooltip-heading">
        {talent.iconUrl ? <img src={talent.iconUrl} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; }} /> : null}
        <div><strong>{talent.name}</strong><span>PvP-талант · {selected ? "выбран" : "доступен"}{talent.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      <TalentDescription talent={talent} />
    </div>
    <div className="tc-tooltip-state"><span className="tc-tooltip-rank"><small>Уровень</small><b>{talent.levelRequired ?? 80}</b></span><span className={selected ? "is-ready" : "is-available"}>{selected ? <Check /> : <Flame />}<span>{selected ? "Установлен" : "Можно выбрать"}</span></span></div>
    <div className="tc-tooltip-controls" aria-hidden="true"><span><kbd>ЛКМ</kbd>Открыть выбор</span><span><kbd>Esc</kbd>Закрыть</span></div>
    <div className="tc-tooltip-foot"><span>Midnight · PvP · {talent.buildVersion}</span><span>Источник: {iconSource}</span></div>
  </aside>;
}

const TreeTooltipLayer = memo(forwardRef<TreeTooltipLayerHandle, {
  theme: TalentSpecTheme;
  ranks: Map<string, number>;
  choices: ChoiceState;
  nodeCatalog: TalentNodeCatalog;
  data: TalentCalculatorData;
}>(function TreeTooltipLayer({ theme, ranks, choices, nodeCatalog, data }, ref) {
  const [tooltip, setTooltip] = useState<TreeTooltipState | null>(null);
  const [motion, setMotion] = useState<TooltipMotion>("open");

  useImperativeHandle(ref, () => ({
    show(next) {
      startTransition(() => {
        setMotion("open");
        setTooltip(next);
      });
    },
    close() {
      startTransition(() => setMotion("closing"));
    },
    clear() {
      setTooltip(null);
      setMotion("open");
    },
  }), []);

  if (!tooltip || typeof document === "undefined") return null;
  const spent = countRanks(ranks, tooltip.treeKind, data.trees[tooltip.treeKind].nodes);
  const lockReason = nodeAvailability(tooltip.node, tooltip.treeKind, ranks, spent, nodeCatalog).reason;
  return createPortal(
    <div className="tc-tooltip-layer" data-spec={theme.slug} data-spec-motif={theme.motif} style={{ "--tc-accent": theme.accent, "--tc-hot": theme.hot, "--tc-deep": theme.deep, "--tc-accent-rgb": theme.accentRgb, "--tc-hot-rgb": theme.hotRgb, "--tc-ambient-rgb": theme.ambientRgb } as CSSProperties}>
      <Tooltip node={tooltip.node} treeKind={tooltip.treeKind} left={tooltip.left} top={tooltip.top} anchorOffset={tooltip.anchorOffset} placement={tooltip.placement} motion={motion} selectedChoice={choices.get(tooltip.node.id)} currentRank={ranks.get(tooltip.node.id) ?? 0} lockReason={lockReason} id={`tooltip-${tooltip.node.id}`} />
    </div>,
    document.body,
  );
}));

function TalentTieredTooltip({ node }: { node: TalentNode }) {
  const icon = node.choices[0]?.iconUrl;
  let firstRank = 1;
  return (
    <div className="tc-tooltip-tiered">
      <div className="tc-tooltip-heading">
        {icon ? <img src={icon} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; }} /> : null}
        <div><strong>{node.choices[0]?.name ?? "Apex Talent"}</strong><span>Apex Talent · последовательные ранги{node.choices[0]?.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      {node.choices.map((choice) => {
        const start = firstRank;
        firstRank += choice.maxRanks;
        return <div className="tc-tooltip-tier" key={choice.externalId}><b>Ранг {start}{choice.maxRanks > 1 ? `–${start + choice.maxRanks - 1}` : ""}</b><TalentDescription talent={choice} /></div>;
      })}
    </div>
  );
}

function TalentTooltipChoice({ choice, index, showChoice, tiered, selected }: { choice: TalentChoice; index: number; showChoice: boolean; tiered: boolean; selected: boolean }) {
  return (
    <div className={`tc-tooltip-choice${selected ? " is-selected" : ""}`}>
      <div className="tc-tooltip-heading">
        {showChoice ? <span className="tc-choice-marker" aria-hidden="true">{selected ? "✓" : index + 1}</span> : null}
        {choice.iconUrl ? <img src={choice.iconUrl} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; }} /> : null}
        <div><strong>{choice.name}</strong><span>{showChoice ? `Вариант ${index + 1} · ` : tiered ? `Уровень ${index + 1} · ` : ""}{choice.talentType === "active" ? "Активная способность" : "Пассивный эффект"}{choice.iconFallback ? " · иконка-замена" : ""}</span></div>
      </div>
      <TalentDescription talent={choice} />
      <small>Макс. ранг: {choice.maxRanks}</small>
    </div>
  );
}

type TalentNodeView = { node: TalentNode; rank: number; selectedChoice?: number; available: boolean; lockReason: string; blockerNodeIds: string[]; hasMatch: boolean };
type MoveDirection = "up" | "down" | "left" | "right" | "home" | "end";

function TalentIconImage({ choice, className }: { choice: TalentChoice; className?: string }) {
  return <img className={className} loading="lazy" decoding="async" fetchPriority="low" width={56} height={56} data-icon-source={choice.iconSource} data-icon-fallback={choice.iconFallback ? "true" : undefined} src={choice.iconUrl || UNVERIFIED_ICON_URL} alt="" onError={(event) => { if (event.currentTarget.src.endsWith(UNVERIFIED_ICON_URL)) return; event.currentTarget.src = UNVERIFIED_ICON_URL; event.currentTarget.dataset.iconSource = "fallback"; event.currentTarget.dataset.iconFallback = "true"; }} />;
}

type TalentVisual = ReturnType<typeof talentVisualTheme>;

function TalentSigil({ visual }: { visual: TalentVisual }) {
  return (
    <svg
      className={`tc-node-sigil tc-sigil-${visual.asset}`}
      data-vfx-asset={visual.assetId}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{
        "--tc-sigil-rotation": `${visual.sigilRotation}deg`,
        "--tc-sigil-dash": visual.sigilDash,
      } as CSSProperties}
    >
      <path className="tc-sigil-orbit" d={visual.sigilPath} />
      <path className="tc-sigil-mark" d={visual.assetMark} />
    </svg>
  );
}

const TalentNodeButton = memo(function TalentNodeButton({ view, tabIndex, openTooltip, closeTooltip, onRank, onCycleChoice, onMoveFocus, onFocusNode, onInspectRequirements }: { view: TalentNodeView; tabIndex: number; openTooltip: OpenTooltip; closeTooltip: () => void; onRank: (node: TalentNode, direction: 1 | -1) => void; onCycleChoice: (node: TalentNode, direction: 1 | -1) => void; onMoveFocus: (node: TalentNode, direction: MoveDirection) => void; onFocusNode: (nodeId: string) => void; onInspectRequirements: (nodeId: string | null, blockerNodeIds?: string[]) => void }) {
  const [pointerActive, setPointerActive] = useState(false);
  const pointerActiveTimerRef = useRef<number | null>(null);
  const { node, rank, selectedChoice, available, lockReason, blockerNodeIds, hasMatch } = view;
  const selected = node.choices.find((choice) => choice.externalId === selectedChoice);
  const displayedChoice = selected || node.choices[0];
  const selectedChoiceIndex = node.choices.findIndex((choice) => choice.externalId === selectedChoice);
  const visual = talentVisualTheme(node, selectedChoice);
  const showSigil = rank > 0 || pointerActive;
  return (
    <button
      className={`tc-node ${node.talentType} ${node.nodeType} tc-vfx-${visual.theme}${rank ? " is-selected" : ""}${!available ? " is-locked" : ""}${hasMatch ? "" : " is-dimmed"}`}
      style={{ left: `${node.x}%`, top: `${node.y}%`, "--tc-node-delay": `${Math.min(620, 170 + node.row * 42 + node.column * 15)}ms`, "--tc-vfx-phase": `${visual.phaseMs}ms`, "--tc-vfx-speed": `${visual.durationMs}ms`, "--tc-vfx-angle": `${visual.angleDeg}deg` } as CSSProperties}
      type="button"
      data-node-id={node.id}
      tabIndex={tabIndex}
      aria-label={`${node.nodeType === "tiered" ? (node.choices[0]?.name ?? "Apex Talent") : node.choices.map((choice) => choice.name).join(" или ")}, ${node.nodeType === "tiered" ? "последовательные ранги" : `выбранный вариант ${selected?.name ?? "не выбран"}`}, ранг ${rank} из ${node.maxRanks}${available ? "" : `, недоступен: ${lockReason}`}`}
      aria-describedby={`tooltip-${node.id}`}
      aria-pressed={rank > 0}
      aria-disabled={!available}
      title={!available ? lockReason : undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onMoveFocus(node, event.key.slice(5).toLowerCase() as MoveDirection);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          onMoveFocus(node, event.key.toLowerCase() as MoveDirection);
        } else if ((event.key === "Backspace" || event.key === "Delete") && rank > 0) {
          event.preventDefault();
          scheduleTalentBurst(event.currentTarget);
          onRank(node, -1);
        } else if (event.key === "]" && available && node.nodeType === "choice" && rank >= node.maxRanks) {
          event.preventDefault();
          scheduleTalentBurst(event.currentTarget);
          onCycleChoice(node, 1);
        } else if (event.key === "[" && available && node.nodeType === "choice" && rank >= node.maxRanks) {
          event.preventDefault();
          scheduleTalentBurst(event.currentTarget);
          onCycleChoice(node, -1);
        }
      }}
      onMouseEnter={(event) => {
        if (!window.matchMedia("(hover: hover)").matches) return;
        if (pointerActiveTimerRef.current !== null) window.clearTimeout(pointerActiveTimerRef.current);
        const target = event.currentTarget;
        // Don't mount the decorative sigil during the pointer event itself.
        pointerActiveTimerRef.current = window.setTimeout(() => {
          pointerActiveTimerRef.current = null;
          if (target.isConnected) setPointerActive(true);
        }, 80);
        onInspectRequirements(available ? null : node.id, blockerNodeIds);
        openTooltip(node, event.currentTarget, false, 120);
      }}
      onMouseLeave={() => {
        if (!window.matchMedia("(hover: hover)").matches) return;
        if (pointerActiveTimerRef.current !== null) window.clearTimeout(pointerActiveTimerRef.current);
        pointerActiveTimerRef.current = null;
        setPointerActive(false);
        onInspectRequirements(null);
        closeTooltip();
      }}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        if (pointerActiveTimerRef.current !== null) window.clearTimeout(pointerActiveTimerRef.current);
        pointerActiveTimerRef.current = null;
        setPointerActive(true);
        onFocusNode(node.id);
        onInspectRequirements(available ? null : node.id, blockerNodeIds);
        openTooltip(node, event.currentTarget, true);
      }}
      onBlur={() => {
        if (pointerActiveTimerRef.current !== null) window.clearTimeout(pointerActiveTimerRef.current);
        pointerActiveTimerRef.current = null;
        setPointerActive(false);
        onInspectRequirements(null);
        closeTooltip();
      }}
      onClick={(event) => { if (available && node.nodeType === "choice" && rank >= node.maxRanks) { scheduleTalentBurst(event.currentTarget); onCycleChoice(node, 1); } else if (available) { scheduleTalentBurst(event.currentTarget); onRank(node, 1); } else { onInspectRequirements(node.id, blockerNodeIds); } openTooltip(node, event.currentTarget); }}
      onContextMenu={(event) => { event.preventDefault(); if (rank > 0) { scheduleTalentBurst(event.currentTarget); onRank(node, -1); } }}
    >
      {showSigil ? <><span className="tc-node-vfx" aria-hidden="true" /><TalentSigil visual={visual} /></> : null}
      <span className="tc-node-ring" />
      <span className={`tc-node-art${node.nodeType === "choice" ? " is-choice" : ""}`} data-selected-choice={selectedChoiceIndex >= 0 ? selectedChoiceIndex : undefined} aria-hidden="true">
        {displayedChoice ? <TalentIconImage choice={displayedChoice} className="tc-choice-art-selected" /> : null}
        {node.nodeType === "choice" && node.choices.length > 1 ? <span className="tc-choice-switch"><i /><i /><b>↔</b></span> : null}
      </span>
      <span className="tc-node-count">{rank}/{node.maxRanks}</span>
    </button>
  );
}, (previous, next) => (previous.view === next.view || (previous.view.node === next.view.node
  && previous.view.rank === next.view.rank
  && previous.view.selectedChoice === next.view.selectedChoice
  && previous.view.available === next.view.available
  && previous.view.lockReason === next.view.lockReason
  && previous.view.blockerNodeIds.join("|") === next.view.blockerNodeIds.join("|")
  && previous.view.hasMatch === next.view.hasMatch))
  && previous.tabIndex === next.tabIndex
  && previous.openTooltip === next.openTooltip
  && previous.closeTooltip === next.closeTooltip
  && previous.onRank === next.onRank
  && previous.onCycleChoice === next.onCycleChoice
  && previous.onMoveFocus === next.onMoveFocus
  && previous.onFocusNode === next.onFocusNode
  && previous.onInspectRequirements === next.onInspectRequirements);

const emptyMatchedNodeIds = new Set<string>();

const TalentTreeView = memo(function TalentTreeView({ tree, ranks, choices, spentInTree, nodeCatalog, searchIndex, onRank, onCycleChoice, query, openTooltip, closeTooltip }: { tree: TalentTree; ranks: Map<string, number>; choices: ChoiceState; spentInTree: number; nodeCatalog: TalentNodeCatalog; searchIndex: TalentSearchIndex; onRank: (node: TalentNode, direction: 1 | -1) => void; onCycleChoice: (node: TalentNode, direction: 1 | -1) => void; query: string; openTooltip: RootOpenTooltip; closeTooltip: () => void }) {
  const [focusedNodeId, setFocusedNodeId] = useState(tree.nodes[0]?.id ?? "");
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeViewCacheRef = useRef(new Map<string, CachedTalentNodeView>());
  const nodeElementCacheRef = useRef(new Map<string, {
    view: TalentNodeView;
    tabIndex: number;
    openTooltip: OpenTooltip;
    closeTooltip: () => void;
    onRank: (node: TalentNode, direction: 1 | -1) => void;
    onCycleChoice: (node: TalentNode, direction: 1 | -1) => void;
    onMoveFocus: (node: TalentNode, direction: MoveDirection) => void;
    onFocusNode: (nodeId: string) => void;
    onInspectRequirements: (nodeId: string | null, blockerNodeIds?: string[]) => void;
    element: ReactElement;
  }>());
  const edgeElementCacheRef = useRef(new Map<string, {
    isLit: boolean;
    isDimmed: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    element: ReactElement;
  }>());
  const highlightedRequirementRef = useRef<Element[]>([]);
  const openTreeTooltip = useCallback((node: TalentNode, target: HTMLButtonElement, immediate?: boolean, delayMs?: number) => openTooltip(node, target, tree.kind, immediate, delayMs), [openTooltip, tree.kind]);
  const inspectRequirements = useCallback((targetNodeId: string | null, blockerNodeIds: string[] = []) => {
    highlightedRequirementRef.current.forEach((element) => element.classList.remove("is-prerequisite", "is-requirement-target", "is-requirement-path"));
    highlightedRequirementRef.current = [];
    const canvas = canvasRef.current;
    if (!canvas || !targetNodeId) return;
    const target = canvas.querySelector(`[data-node-id="${CSS.escape(targetNodeId)}"]`);
    if (target) {
      target.classList.add("is-requirement-target");
      highlightedRequirementRef.current.push(target);
    }
    blockerNodeIds.forEach((blockerNodeId) => {
      const blocker = canvas.querySelector(`[data-node-id="${CSS.escape(blockerNodeId)}"]`);
      if (blocker) {
        blocker.classList.add("is-prerequisite");
        highlightedRequirementRef.current.push(blocker);
      }
      const edge = canvas.querySelector(`[data-edge-from="${CSS.escape(blockerNodeId)}"][data-edge-to="${CSS.escape(targetNodeId)}"]`);
      if (edge) {
        edge.classList.add("is-requirement-path");
        highlightedRequirementRef.current.push(edge);
      }
    });
  }, []);
  const edges = useMemo(() => edgeList(tree.nodes), [tree.nodes]);
  const normalizedQuery = query.trim().toLowerCase();
  const nodeViews = useMemo<TalentNodeView[]>(() => tree.nodes.map((node) => {
    const rank = ranks.get(node.id) ?? 0;
    const selectedChoice = choices.get(node.id);
    const previous = nodeViewCacheRef.current.get(node.id);
    if (previous
      && previous.node === node
      && previous.rank === rank
      && previous.selectedChoice === selectedChoice
      && previous.ranks === ranks
      && previous.nodeCatalog === nodeCatalog
      && previous.spentInTree === spentInTree
      && previous.treeKind === tree.kind) {
      const hasMatch = normalizedQuery === "" || (searchIndex.get(node.id)?.some((text) => text.includes(normalizedQuery)) ?? false);
      if (previous.hasMatch === hasMatch) return previous.view;
      const view = { ...previous.view, hasMatch };
      nodeViewCacheRef.current.set(node.id, { ...previous, view, hasMatch });
      return view;
    }
    const hasMatch = normalizedQuery === "" || (searchIndex.get(node.id)?.some((text) => text.includes(normalizedQuery)) ?? false);
    const pointsBeforeNode = Math.max(0, spentInTree - rank);
    const pointGate = node.requiredPoints && pointsBeforeNode < node.requiredPoints ? node.requiredPoints - pointsBeforeNode : 0;
    const requiredRanks = talentRequirementRankSignature(node.requiresNodeIds, nodeCatalog, ranks);
    const previousRanks = talentRequirementRankSignature(node.prevNodeIds, nodeCatalog, ranks, tree.kind);
    if (previous
      && previous.node === node
      && previous.rank === rank
      && previous.selectedChoice === selectedChoice
      && previous.pointGate === pointGate
      && previous.requiredRanks === requiredRanks
      && previous.previousRanks === previousRanks
      && previous.hasMatch === hasMatch) return previous.view;

    const availability = nodeAvailability(node, tree.kind, ranks, spentInTree, nodeCatalog);
    const view = { node, rank, selectedChoice, available: availability.available, lockReason: availability.reason, blockerNodeIds: availability.blockerNodeIds, hasMatch };
    nodeViewCacheRef.current.set(node.id, { view, node, rank, selectedChoice, ranks, nodeCatalog, spentInTree, treeKind: tree.kind, pointGate, requiredRanks, previousRanks, hasMatch });
    return view;
  }), [choices, nodeCatalog, normalizedQuery, ranks, searchIndex, spentInTree, tree.kind, tree.nodes]);
  const matchedNodeIds = useMemo(() => normalizedQuery
    ? new Set(nodeViews.filter((view) => view.hasMatch).map((view) => view.node.id))
    : emptyMatchedNodeIds, [nodeViews, normalizedQuery]);
  const edgeElements = useMemo(() => edges.map(([from, to]) => {
    const isDimmed = normalizedQuery !== "" && !matchedNodeIds.has(from.id) && !matchedNodeIds.has(to.id);
    const isLit = !isDimmed && (ranks.get(from.id) ?? 0) > 0 && (ranks.get(to.id) ?? 0) > 0;
    const key = `${from.id}-${to.id}`;
    const cached = edgeElementCacheRef.current.get(key);
    if (cached?.isLit === isLit && cached.isDimmed === isDimmed
      && cached.x1 === from.x && cached.y1 === from.y && cached.x2 === to.x && cached.y2 === to.y) return cached.element;

    const element = createElement("line", {
      key,
      "data-edge-from": from.id,
      "data-edge-to": to.id,
      className: `${isLit ? "is-lit" : ""}${isDimmed ? " is-dimmed" : ""}`.trim() || undefined,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
    });
    edgeElementCacheRef.current.set(key, { isLit, isDimmed, x1: from.x, y1: from.y, x2: to.x, y2: to.y, element });
    return element;
  }), [edges, matchedNodeIds, normalizedQuery, ranks]);
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
  const nodeElements = useMemo(() => nodeViews.map((view) => {
    const tabIndex = focusedNodeId === view.node.id ? 0 : -1;
    const cached = nodeElementCacheRef.current.get(view.node.id);
    if (cached
      && cached.view === view
      && cached.tabIndex === tabIndex
      && cached.openTooltip === openTreeTooltip
      && cached.closeTooltip === closeTooltip
      && cached.onRank === onRank
      && cached.onCycleChoice === onCycleChoice
      && cached.onMoveFocus === moveFocus
      && cached.onFocusNode === setFocusedNodeId
      && cached.onInspectRequirements === inspectRequirements) return cached.element;

    const element = createElement(TalentNodeButton, {
      key: view.node.id,
      view,
      tabIndex,
      openTooltip: openTreeTooltip,
      closeTooltip,
      onRank,
      onCycleChoice,
      onMoveFocus: moveFocus,
      onFocusNode: setFocusedNodeId,
      onInspectRequirements: inspectRequirements,
    });
    nodeElementCacheRef.current.set(view.node.id, {
      view,
      tabIndex,
      openTooltip: openTreeTooltip,
      closeTooltip,
      onRank,
      onCycleChoice,
      onMoveFocus: moveFocus,
      onFocusNode: setFocusedNodeId,
      onInspectRequirements: inspectRequirements,
      element,
    });
    return element;
  }), [closeTooltip, focusedNodeId, inspectRequirements, moveFocus, nodeViews, onCycleChoice, onRank, openTreeTooltip]);

  // Keep pointer activity local; waking the panel invalidates styles for every tree node.
  return (
    <div
      className="tc-tree-canvas"
      ref={canvasRef}
      onFocusCapture={(event) => event.currentTarget.closest<HTMLElement>(".tc-panel")?.classList.add("is-node-active")}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.closest<HTMLElement>(".tc-panel")?.classList.remove("is-node-active");
      }}
    >
      <svg className="tc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edgeElements}
      </svg>
      {nodeElements}
    </div>
  );
}, (previous, next) => {
  if (previous.tree !== next.tree
    || previous.spentInTree !== next.spentInTree
    || previous.nodeCatalog !== next.nodeCatalog
    || previous.onRank !== next.onRank
    || previous.onCycleChoice !== next.onCycleChoice
    || previous.query !== next.query
    || previous.openTooltip !== next.openTooltip
    || previous.closeTooltip !== next.closeTooltip) return false;

  if (previous.ranks === next.ranks && previous.choices === next.choices) return true;

  for (const node of previous.tree.nodes) {
    if (previous.ranks.get(node.id) !== next.ranks.get(node.id)
      || previous.choices.get(node.id) !== next.choices.get(node.id)) return false;

    // Cross-tree requirements are uncommon, but their availability must still
    // update when one of their prerequisite nodes changes.
    for (const requiredId of node.requiresNodeIds) {
      if ((previous.nodeCatalog.get(requiredId) ?? []).some((requiredNode) => previous.ranks.get(requiredNode.id) !== next.ranks.get(requiredNode.id))) return false;
    }
  }
  return true;
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

function removeInvalidDependents(data: TalentCalculatorData, ranks: Map<string, number>, choices: ChoiceState, catalog: TalentNodeCatalog) {
  const nodes = new Map<string, TalentNode>();
  const treeKinds = new Map<string, TalentKind>();
  const spentByTree: Record<TalentKind, number> = { class: 0, hero: 0, spec: 0 };
  (Object.entries(data.trees) as [TalentKind, TalentTree][]).forEach(([kind, tree]) => {
    spentByTree[kind] = countRanks(ranks, kind, tree.nodes);
    tree.nodes.forEach((node) => {
      nodes.set(node.id, node);
      treeKinds.set(node.id, kind);
    });
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...ranks.keys()]) {
      const node = nodes.get(id);
      const treeKind = treeKinds.get(id);
      const rank = ranks.get(id) ?? 0;
      if (!node || !treeKind || !nodeAvailability(node, treeKind, ranks, spentByTree[treeKind], catalog).available) {
        ranks.delete(id);
        choices.delete(id);
        if (node && treeKind && !node.freeNode) spentByTree[treeKind] = Math.max(0, spentByTree[treeKind] - rank);
        changed = true;
      }
    }
  }
}

function sanitizeLoadout(data: TalentCalculatorData, decoded: { ranks: Map<string, number>; choices: ChoiceState; pvp: Array<number | null> }): SanitizedLoadout {
  const nodes = new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.id, node] as const)));
  const catalog = createTalentNodeCatalog(data);
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
      if (!treeKind || !nodeAvailability(node, treeKind, ranks, countRanks(ranks, treeKind, data.trees[treeKind].nodes), catalog).available) {
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

function ErrorState({ theme }: { theme: TalentSpecTheme }) {
  return <main className="talent-calculator tc-state" data-spec={theme.slug} data-spec-motif={theme.motif}><div className="tc-state-card"><span className="tc-state-kicker">Midnight · {theme.classNameRu}</span><h1>Дерево «{theme.specNameRu}» недоступно</h1><p>Не удалось получить актуальный игровой срез. Обновите страницу, чтобы повторить запрос.</p></div></main>;
}

function ResourceGlyph({ motif }: { motif: TalentSpecTheme["motif"] }) {
  const Icon = motif === "frost" ? Snowflake
    : motif === "blood" ? Droplets
      : ["plague", "decay", "poison"].includes(motif) ? Skull
        : ["storm", "spirit", "wind"].includes(motif) ? Zap
          : ["tide", "mist", "brew"].includes(motif) ? Waves
            : ["astral", "dream", "time", "arcane"].includes(motif) ? Sparkles
              : ["shadow", "void", "abyss", "demon", "vengeance"].includes(motif) ? Eye
                : ["shield", "bulwark"].includes(motif) ? Shield
                  : ["beast", "wild"].includes(motif) ? PawPrint
                    : motif === "nature" ? Leaf
                      : motif === "marksman" ? Crosshair
                        : ["fury", "steel", "spear", "pirate"].includes(motif) ? Swords
                          : ["holy", "sun", "judgment", "atonement"].includes(motif) ? Sun
                            : ["fire", "dragonfire", "chaos", "fel"].includes(motif) ? Flame
                              : CircleDot;
  return <Icon strokeWidth={1.7} />;
}

const TalentSearchField = memo(function TalentSearchField({ count, onQueryChange }: { count: number; onQueryChange: (value: string) => void }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      startTransition(() => onQueryChange(value));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [onQueryChange, value]);

  return <div className="tc-search"><label htmlFor="tc-search-input"><span aria-hidden="true">⌕</span><span className="sr-only">Поиск талантов</span></label><input id="tc-search-input" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Поиск по талантам" />{value && <span className="tc-search-count" aria-live="polite">{count}</span>}{value && <button type="button" aria-label="Очистить поиск" onClick={() => setValue("")}>×</button>}</div>;
});

const TalentHeaderSearch = memo(function TalentHeaderSearch({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const [value, setValue] = useState(query);

  useEffect(() => setValue(query), [query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      startTransition(() => onQueryChange(value));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [onQueryChange, value]);

  return <label className="tc-header-search"><span className="sr-only">Поиск билдов и талантов</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Поиск билдов, талантов..." /><Search /></label>;
});

export function TalentCalculator({ data, theme }: { data: TalentCalculatorData | null; theme: TalentSpecTheme }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const localePrefix = pathname.startsWith("/ru/") || pathname === "/ru" ? "/ru" : "";
  const defaultBuildName = `Мой билд: ${theme.specNameRu}`;
  const isFury = theme.slug === "fury-warrior";
  const dataLoadoutKey = data ? `${data.specId}:${data.buildVersion}:${data.heroSubtreeId}` : "";
  const loadoutDataRef = useRef(data);
  loadoutDataRef.current = data;
  const initialLoadout = useMemo<SanitizedLoadout>(() => {
    if (!data) return { ranks: new Map(), choices: new Map(), pvp: [null, null, null], adjusted: false };
    const encoded = searchParams.get("loadout");
    const explicitImport = searchParams.get("import");
    const decoded = encoded ? decodeLoadout(encoded) : null;
    const useReferenceBuild = isFury && searchParams.has("returnTo");
    const imported = explicitImport ?? (useReferenceBuild ? FURY_REFERENCE_LOADOUT : "");
    const wowDecoded = !encoded && imported ? decodeWoWTalentLoadout(data, imported) : null;
    const candidate = decoded ?? (wowDecoded ? { ...wowDecoded, pvp: [null, null, null] } : null);
    return candidate ? sanitizeLoadout(data, candidate) : { ranks: freeTalentRanks(data), choices: new Map(), pvp: [null, null, null], adjusted: false };
  }, [data, isFury, searchParams]);
  const [ranks, setRanks] = useState<Map<string, number>>(() => new Map(initialLoadout.ranks));
  const [choices, setChoices] = useState<ChoiceState>(() => new Map(initialLoadout.choices));
  const ranksRef = useRef(ranks);
  useLayoutEffect(() => { ranksRef.current = ranks; }, [ranks]);
  const choicesRef = useRef(choices);
  useLayoutEffect(() => { choicesRef.current = choices; }, [choices]);
  const [pvpSelections, setPvpSelections] = useState<Array<number | null>>(() => [...initialLoadout.pvp]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const updateTalentQuery = useCallback((value: string) => setQuery(value), []);
  const [mobileTree, setMobileTree] = useState<TalentKind>("class");
  const [compactLayout, setCompactLayout] = useState(false);
  const [mountedTrees, setMountedTrees] = useState<Set<TalentKind>>(() => new Set(["class"]));
  const [performanceTier, setPerformanceTier] = useState<PerformanceTier>("balanced");
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [invalidLoadout, setInvalidLoadout] = useState(false);
  const [buildName, setBuildName] = useState(defaultBuildName);
  const [savedBuilds, setSavedBuilds] = useState<SavedTalentBuild[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importError, setImportError] = useState("");
  const [undoState, setUndoState] = useState<{ ranks: Map<string, number>; choices: ChoiceState; pvp: Array<number | null> } | null>(null);
  const [pvpPickerSlot, setPvpPickerSlot] = useState<number | null>(null);
  const [pvpQuery, setPvpQuery] = useState("");
  const [tooltip, setTooltip] = useState<PvpTooltipState | null>(null);
  const [tooltipMotion, setTooltipMotion] = useState<TooltipMotion>("open");
  const tooltipRef = useRef<TooltipState>(null);
  const treeTooltipLayerRef = useRef<TreeTooltipLayerHandle>(null);
  const tooltipOpenTimerRef = useRef<number | null>(null);
  const tooltipCloseTimerRef = useRef<number | null>(null);
  const loadoutMenuRef = useRef<HTMLDivElement>(null);
  const loadoutTriggerRef = useRef<HTMLButtonElement>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const calculatorRef = useRef<HTMLElement>(null);
  const pvpPickerRef = useRef<HTMLDivElement>(null);
  const pvpSlotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pvpReturnFocusRef = useRef<number | null>(null);
  const pendingPvpBurstRef = useRef<{ slot: number; action: "equip" | "remove" } | null>(null);
  const suppressPvpTooltipRef = useRef(false);
  const budgets = useMemo(() => data ? talentPointBudgets(data) : { class: 34, hero: 13, spec: 34 }, [data]);
  const nodeCatalog = useMemo(() => createTalentNodeCatalog(data), [data]);
  const treeStateKeys = useMemo(() => {
    const rankKeys = {} as Record<TalentKind, Set<string>>;
    const choiceKeys = {} as Record<TalentKind, Set<string>>;
    for (const kind of ["class", "hero", "spec"] as const) {
      const nodes = data?.trees[kind].nodes ?? [];
      const ownKeys = new Set(nodes.map((node) => node.id));
      const relevantRanks = new Set(ownKeys);
      for (const node of nodes) {
        for (const requirementId of node.requiresNodeIds) {
          for (const dependency of nodeCatalog.get(requirementId) ?? []) relevantRanks.add(dependency.id);
        }
      }
      rankKeys[kind] = relevantRanks;
      choiceKeys[kind] = ownKeys;
    }
    return { rankKeys, choiceKeys };
  }, [data, nodeCatalog]);
  const treeRanksCacheRef = useRef<Record<TalentKind, Map<string, number>> | null>(null);
  const treeRanks = useMemo(() => {
    const previous = treeRanksCacheRef.current;
    const next = {} as Record<TalentKind, Map<string, number>>;
    for (const kind of ["class", "hero", "spec"] as const) {
      const values = new Map<string, number>();
      for (const id of treeStateKeys.rankKeys[kind]) {
        const value = ranks.get(id);
        if (value !== undefined) values.set(id, value);
      }
      const old = previous?.[kind];
      next[kind] = old && mapsHaveSameValues(old, values) ? old : values;
    }
    treeRanksCacheRef.current = next;
    return next;
  }, [ranks, treeStateKeys]);
  const treeChoicesCacheRef = useRef<Record<TalentKind, ChoiceState> | null>(null);
  const treeChoices = useMemo(() => {
    const previous = treeChoicesCacheRef.current;
    const next = {} as Record<TalentKind, ChoiceState>;
    for (const kind of ["class", "hero", "spec"] as const) {
      const values = new Map<string, number>();
      for (const id of treeStateKeys.choiceKeys[kind]) {
        const value = choices.get(id);
        if (value !== undefined) values.set(id, value);
      }
      const old = previous?.[kind];
      next[kind] = old && mapsHaveSameValues(old, values) ? old : values;
    }
    treeChoicesCacheRef.current = next;
    return next;
  }, [choices, treeStateKeys]);
  const rankByTree = useMemo(() => countRanksByTree(ranks, data), [data, ranks]);
  const spent = rankByTree.class + rankByTree.hero + rankByTree.spec;
  const currentSignature = useMemo(() => encodeLoadout(ranks, choices, pvpSelections), [choices, pvpSelections, ranks]);
  const defaultReturnTo = `${localePrefix}/wow/rotation/${theme.slug}`;
  const returnToValue = searchParams.get("returnTo") ?? defaultReturnTo;
  const expectedReturnTo = new RegExp(`^/(?:ru/)?wow/rotation/${theme.slug}$`);
  const returnTo = expectedReturnTo.test(returnToValue) ? returnToValue : defaultReturnTo;
  const rotationFlow = searchParams.has("returnTo");
  const closePvpPicker = useCallback(() => {
    const slot = pvpPickerSlot;
    if (slot !== null) pvpReturnFocusRef.current = slot;
    setPvpPickerSlot(null);
  }, [pvpPickerSlot]);
  const closeImport = useCallback(() => { setImportOpen(false); setImportError(""); }, []);

  useEffect(() => () => {
    if (tooltipOpenTimerRef.current !== null) window.clearTimeout(tooltipOpenTimerRef.current);
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
  }, []);

  useEffect(() => {
    const calculator = calculatorRef.current;
    if (!calculator) return;
    calculator.dataset.interactive = "true";
    return () => { delete calculator.dataset.interactive; };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    let cancelMount: (() => void) | null = null;
    const mountRemainingTrees = () => {
      if (media.matches) return;
      cancelMount?.();
      // Build the below-fold tree only after the browser has spare main-thread
      // time; a fixed short timer competes with hydration on slower devices.
      cancelMount = scheduleWhenIdle(() => {
        cancelMount = null;
        if (media.matches) return;
        startTransition(() => {
          setMountedTrees((current) => current.has("hero") ? current : new Set<TalentKind>([...current, "hero"]));
        });
      }, 1200);
    };
    const updateLayoutBudget = () => {
      const nextCompact = media.matches;
      const nextTier = getPerformanceTier();
      setCompactLayout((current) => current === nextCompact ? current : nextCompact);
      setPerformanceTier((current) => current === nextTier ? current : nextTier);
      if (nextCompact && cancelMount !== null) {
        cancelMount();
        cancelMount = null;
      }
      if (!nextCompact) mountRemainingTrees();
    };
    const updateVisibility = () => {
      if (calculatorRef.current) calculatorRef.current.dataset.pageActive = document.hidden ? "false" : "true";
    };
    updateLayoutBudget();
    updateVisibility();
    media.addEventListener("change", updateLayoutBudget);
    window.addEventListener("resize", updateLayoutBudget, { passive: true });
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      media.removeEventListener("change", updateLayoutBudget);
      window.removeEventListener("resize", updateLayoutBudget);
      document.removeEventListener("visibilitychange", updateVisibility);
      cancelMount?.();
    };
  }, []);

  useEffect(() => {
    if (compactLayout || !mountedTrees.has("hero") || mountedTrees.has("spec")) return;
    // Keep the final tree off the main thread until the next idle window.
    const cancelMount = scheduleWhenIdle(() => {
      startTransition(() => {
        setMountedTrees((current) => current.has("spec") ? current : new Set<TalentKind>([...current, "spec"]));
      });
    }, 1500);
    return cancelMount;
  }, [compactLayout, mountedTrees]);

  useEffect(() => {
    if (!compactLayout || mountedTrees.has(mobileTree)) return;
    const cancelMount = scheduleWhenIdle(() => {
      startTransition(() => {
        setMountedTrees((current) => current.has(mobileTree)
          ? current
          : new Set<TalentKind>([...current, mobileTree]));
      });
    }, 120);
    return cancelMount;
  }, [compactLayout, mobileTree, mountedTrees]);

  useEffect(() => {
    if (!dataLoadoutKey) return;
    const applyUrlLoadout = () => {
      const currentData = loadoutDataRef.current;
      if (!currentData) return;
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("loadout");
      const explicitImport = params.get("import");
      let savedDecoded: ReturnType<typeof decodeLoadout> = null;
      const library = readBuildLibrary(theme.slug, defaultBuildName);
      setSavedBuilds((current) => sameSavedBuilds(current, library) ? current : library);
      const storedActiveId = readActiveBuildId(theme.slug);
      const storedBuild = library.find((build) => build.id === storedActiveId) ?? library[0] ?? null;
      if (!explicitImport) {
        savedDecoded = storedBuild ? decodeLoadout(storedBuild.loadout) : null;
      }
      const useReferenceBuild = isFury && params.has("returnTo");
      const imported = explicitImport ?? (useReferenceBuild ? FURY_REFERENCE_LOADOUT : "");
      const decoded = encoded ? decodeLoadout(encoded) : null;
      const wowDecoded = !encoded && !savedDecoded && imported ? decodeWoWTalentLoadout(currentData, imported) : null;
      const invalidIncoming = Boolean((encoded && !decoded) || (explicitImport && !wowDecoded));
      setInvalidLoadout(invalidIncoming);
      if (invalidIncoming) setNotice({ message: `Строка сборки повреждена — открыто чистое дерево «${theme.specNameRu}»`, persistent: true });
      const candidate = decoded ?? (!encoded ? savedDecoded : null) ?? (wowDecoded ? { ...wowDecoded, pvp: [null, null, null] } : null);
      const next = candidate ? sanitizeLoadout(currentData, candidate) : { ranks: freeTalentRanks(currentData), choices: new Map<string, number>(), pvp: [null, null, null], adjusted: false };
      if (next.adjusted) setNotice({ message: "Ссылка содержала недоступные таланты — загружены только допустимые ранги", persistent: true });
      setRanks((current) => mapsHaveSameValues(current, next.ranks) ? current : next.ranks);
      setChoices((current) => mapsHaveSameValues(current, next.choices) ? current : next.choices);
      setPvpSelections((current) => current.length === next.pvp.length && current.every((id, index) => id === next.pvp[index]) ? current : next.pvp);
      const nextSignature = encodeLoadout(next.ranks, next.choices, next.pvp);
      const matchedBuild = library.find((build) => build.loadout === nextSignature) ?? null;
      if (matchedBuild) {
        setBuildName(matchedBuild.name);
        setActiveBuildId(matchedBuild.id);
        setSavedSignature(nextSignature);
      } else {
        setActiveBuildId(null);
        setSavedSignature(null);
      }
    };
    applyUrlLoadout();
    window.addEventListener("popstate", applyUrlLoadout);
    return () => window.removeEventListener("popstate", applyUrlLoadout);
  }, [dataLoadoutKey, defaultBuildName, isFury, theme.slug, theme.specNameRu]);

  useEffect(() => {
    if (!loadoutOpen) return;
    const items = () => [...document.querySelectorAll<HTMLElement>('#tc-loadout-menu [role="menuitem"], #tc-loadout-menu input')];
    const focusItem = (index: number) => { const menuItems = items(); if (!menuItems.length) return; menuItems[(index + menuItems.length) % menuItems.length]?.focus(); };
    const onKeyDown = (event: KeyboardEvent) => {
      const menuItems = items();
      const current = menuItems.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") { event.preventDefault(); setLoadoutOpen(false); loadoutTriggerRef.current?.focus(); }
      else if (event.key === "Tab") { event.preventDefault(); focusItem(current + (event.shiftKey ? -1 : 1)); }
      else if (document.activeElement instanceof HTMLInputElement) return;
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
    if (!importOpen) return;
    const calculator = calculatorRef.current;
    const background = calculator ? [...calculator.children].filter((element) => !element.classList.contains("tc-import-dialog") && !element.classList.contains("tc-import-backdrop")) : [];
    background.forEach((element) => element.setAttribute("inert", ""));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = window.requestAnimationFrame(() => importDialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeImport(); return; }
      if (event.key !== "Tab") return;
      const items = [...(importDialogRef.current?.querySelectorAll<HTMLElement>('textarea,button:not([disabled])') ?? [])];
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { background.forEach((element) => element.removeAttribute("inert")); document.body.style.overflow = previousOverflow; window.cancelAnimationFrame(first); window.removeEventListener("keydown", onKeyDown); };
  }, [closeImport, importOpen]);

  useEffect(() => {
    if (!notice) return;
    if (notice.persistent) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeTooltip = () => {
      if (tooltipOpenTimerRef.current !== null) window.clearTimeout(tooltipOpenTimerRef.current);
      if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
      tooltipOpenTimerRef.current = null;
      tooltipCloseTimerRef.current = null;
      tooltipRef.current = null;
      treeTooltipLayerRef.current?.clear();
      setTooltip(null);
      setTooltipMotion("open");
    };
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
    const first = window.requestAnimationFrame(() => pvpPickerRef.current?.querySelector<HTMLInputElement>("[data-pvp-search]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closePvpPicker(); return; }
      const picker = pvpPickerRef.current;
      const options = [...(picker?.querySelectorAll<HTMLButtonElement>("[data-pvp-option]:not([disabled])") ?? [])];
      const optionIndex = options.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown" && (document.activeElement as Element | null)?.matches("[data-pvp-search]")) { event.preventDefault(); options[0]?.focus(); return; }
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

  useEffect(() => {
    if (pvpPickerSlot !== null || pvpReturnFocusRef.current === null) return;
    const slot = pvpReturnFocusRef.current;
    pvpReturnFocusRef.current = null;
    const frame = window.requestAnimationFrame(() => pvpSlotRefs.current[slot]?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pvpPickerSlot]);

  useEffect(() => {
    const pending = pendingPvpBurstRef.current;
    if (!pending) return;
    pendingPvpBurstRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const target = pvpSlotRefs.current[pending.slot];
      suppressPvpTooltipRef.current = true;
      target?.focus();
      if (target) playPvpBurst(target, pending.action);
      window.setTimeout(() => { suppressPvpTooltipRef.current = false; }, 650);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pvpSelections]);

  const changeRank = useCallback((node: TalentNode, direction: 1 | -1) => {
    if (node.freeNode) return;
    const currentRanks = ranksRef.current;
    const currentChoices = choicesRef.current;
    const currentRank = currentRanks.get(node.id) ?? 0;
    const treeKind = node.id.split("-", 1)[0] as TalentKind;
    setInvalidLoadout(false);
    setUndoState(null);
    if (direction > 0 && currentRank < node.maxRanks && data && countRanks(currentRanks, treeKind, data.trees[treeKind].nodes) >= budgets[treeKind]) {
      setNotice({ message: `В дереве уже потрачены все ${budgets[treeKind]} очков — сначала сними один талант` });
      return;
    }

    const nextRanks = new Map(currentRanks);
    const value = Math.max(0, Math.min(node.maxRanks, currentRank + direction));
    if (value === currentRank) return;
    if (value) nextRanks.set(node.id, value); else nextRanks.delete(node.id);

    let nextChoices = currentChoices;
    if (direction > 0 && currentRank === 0 && node.nodeType === "choice" && !currentChoices.has(node.id) && node.choices[0]) {
      nextChoices = new Map(currentChoices);
      nextChoices.set(node.id, node.choices[0].externalId);
    }
    if (direction < 0) {
      nextChoices = new Map(currentChoices);
      if (value === 0) nextChoices.delete(node.id);
      removeInvalidDependents(data!, nextRanks, nextChoices, nodeCatalog);
    }

    ranksRef.current = nextRanks;
    const choicesChanged = nextChoices !== currentChoices && !mapsHaveSameValues(currentChoices, nextChoices);
    if (choicesChanged) {
      choicesRef.current = nextChoices;
    }
    setRanks(nextRanks);
    if (choicesChanged) setChoices(nextChoices);
  }, [budgets, data, nodeCatalog]);

  const cycleChoice = useCallback((node: TalentNode, direction: 1 | -1) => {
    if (node.choices.length < 2) return;
    setInvalidLoadout(false);
    setUndoState(null);
    setChoices((current) => {
      const index = Math.max(0, node.choices.findIndex((choice) => choice.externalId === current.get(node.id)));
      const next = new Map(current);
      next.set(node.id, node.choices[(index + direction + node.choices.length) % node.choices.length].externalId);
      return next;
    });
  }, []);

  const choiceSearchIndexRef = useRef<CachedTalentSearchIndex | null>(null);
  const searchableChoicesByNode = useMemo<TalentSearchIndex>(() => {
    // The index contains every talent description, but no node reads it until
    // the user enters a query. Build it then and reuse it across keystrokes.
    if (!data || !deferredQuery.trim()) return new Map();
    if (choiceSearchIndexRef.current?.data === data) return choiceSearchIndexRef.current.index;
    const index: TalentSearchIndex = new Map();
    Object.values(data.trees).forEach((tree) => tree.nodes.forEach((node) => {
      index.set(node.id, node.choices.map((choice) => `${choice.name} ${choice.description}`.toLowerCase()));
    }));
    choiceSearchIndexRef.current = { data, index };
    return index;
  }, [data, deferredQuery]);
  const matchingTalentCount = useMemo(() => {
    if (!data || !deferredQuery.trim()) return 0;
    const normalized = deferredQuery.trim().toLowerCase();
    return [...searchableChoicesByNode.values()].reduce((total, choices) => total + (choices.some((choice) => choice.includes(normalized)) ? 1 : 0), 0);
  }, [data, deferredQuery, searchableChoicesByNode]);

  const openTooltip = useCallback<RootOpenTooltip>((node, target, treeKind, immediate = false, delayMs = 24) => {
    if (tooltipCloseTimerRef.current === null
      && tooltipRef.current?.kind === "tree"
      && tooltipRef.current.node.id === node.id
      && tooltipRef.current.treeKind === treeKind) return;
    if (tooltipOpenTimerRef.current !== null) window.clearTimeout(tooltipOpenTimerRef.current);
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    tooltipOpenTimerRef.current = null;
    tooltipCloseTimerRef.current = null;
    const reveal = () => {
      tooltipOpenTimerRef.current = null;
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const width = Math.min(370, window.innerWidth - 24);
      const estimatedHeight = Math.min(520, node.nodeType === "tiered" ? 430 : 268 + Math.max(0, node.choices.length - 1) * 112);
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
      const placement: TooltipPlacement = rect.bottom + 14 + estimatedHeight < window.innerHeight ? "below" : "above";
      const top = placement === "below" ? rect.bottom + 14 : Math.max(12, rect.top - estimatedHeight - 14);
      const anchorOffset = Math.min(width - 24, Math.max(24, rect.left + rect.width / 2 - left));
      const next = { kind: "tree" as const, node, treeKind, left, top, anchorOffset, placement };
      const previousTooltip = tooltipRef.current;
      tooltipRef.current = next;
      if (previousTooltip?.kind === "pvp") setTooltip(null);
      treeTooltipLayerRef.current?.show(next);
    };
    if (immediate) reveal();
    else tooltipOpenTimerRef.current = window.setTimeout(reveal, tooltipRef.current ? 0 : delayMs);
  }, []);

  const openPvpTooltip = useCallback((talent: PvPTalent, target: HTMLButtonElement, immediate = false) => {
    if (suppressPvpTooltipRef.current) return;
    if (tooltipOpenTimerRef.current !== null) window.clearTimeout(tooltipOpenTimerRef.current);
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    tooltipOpenTimerRef.current = null;
    tooltipCloseTimerRef.current = null;
    const reveal = () => {
      tooltipOpenTimerRef.current = null;
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const width = Math.min(370, window.innerWidth - 24);
      const estimatedHeight = 265;
      const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left + rect.width / 2 - width / 2));
      const placement: TooltipPlacement = rect.top - estimatedHeight - 14 > 12 ? "above" : "below";
      const top = placement === "above" ? rect.top - estimatedHeight - 14 : Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 14);
      const anchorOffset = Math.min(width - 24, Math.max(24, rect.left + rect.width / 2 - left));
      const next = { kind: "pvp" as const, talent, left, top, anchorOffset, placement };
      tooltipRef.current = next;
      treeTooltipLayerRef.current?.clear();
      startTransition(() => {
        setTooltipMotion("open");
        setTooltip(next);
      });
    };
    if (immediate) reveal();
    else tooltipOpenTimerRef.current = window.setTimeout(reveal, tooltipRef.current ? 0 : 24);
  }, []);

  const closeTooltip = useCallback(() => {
    if (tooltipOpenTimerRef.current !== null) {
      window.clearTimeout(tooltipOpenTimerRef.current);
      tooltipOpenTimerRef.current = null;
    }
    if (!tooltipRef.current) return;
    if (tooltipCloseTimerRef.current !== null) window.clearTimeout(tooltipCloseTimerRef.current);
    const closingKind = tooltipRef.current.kind;
    if (closingKind === "tree") treeTooltipLayerRef.current?.close();
    else startTransition(() => setTooltipMotion("closing"));
    tooltipCloseTimerRef.current = window.setTimeout(() => {
      tooltipRef.current = null;
      tooltipCloseTimerRef.current = null;
      if (closingKind === "tree") treeTooltipLayerRef.current?.clear();
      else startTransition(() => {
        setTooltip(null);
        setTooltipMotion("open");
      });
    }, 120);
  }, []);

  const pvpById = useMemo(() => new Map(data?.pvpTalents.map((talent) => [talent.externalId, talent]) ?? []), [data]);
  const filteredPvpTalents = useMemo(() => {
    const normalized = pvpQuery.trim().toLowerCase();
    if (!normalized) return data?.pvpTalents ?? [];
    return (data?.pvpTalents ?? []).filter((talent) => `${talent.name} ${talent.description}`.toLowerCase().includes(normalized));
  }, [data, pvpQuery]);
  const openPvpPicker = useCallback((slot: number) => { treeTooltipLayerRef.current?.clear(); setTooltip(null); setPvpQuery(""); setPvpPickerSlot(slot); }, []);
  const choosePvpTalent = useCallback((externalId: number) => {
    if (pvpPickerSlot === null) return;
    const talent = pvpById.get(externalId);
    if (!talent) return;
    if (pvpSelections.some((id, index) => id === externalId && index !== pvpPickerSlot)) { setNotice({ message: "Этот PvP-талант уже выбран в другом слоте" }); return; }
    setInvalidLoadout(false); setUndoState(null);
    suppressPvpTooltipRef.current = true;
    pendingPvpBurstRef.current = { slot: pvpPickerSlot, action: "equip" };
    setPvpSelections((current) => current.map((id, index) => index === pvpPickerSlot ? externalId : id));
    const slot = pvpPickerSlot;
    setNotice({ message: `${talent.name} установлен в PvP-слот ${slot + 1}` });
    setPvpPickerSlot(null);
  }, [pvpById, pvpPickerSlot, pvpSelections]);
  const clearPvpTalent = useCallback((slot: number) => {
    const talent = pvpById.get(pvpSelections[slot] ?? -1);
    if (!talent) return;
    const target = pvpSlotRefs.current[slot];
    if (target) playPvpBurst(target, "remove");
    setInvalidLoadout(false); setUndoState(null); setPvpSelections((current) => current.map((id, index) => index === slot ? null : id));
    setNotice({ message: `${talent.name} убран из PvP-слота ${slot + 1}` });
  }, [pvpById, pvpSelections]);

  const themeStyle = {
    "--tc-spec-art": `url('${isFury ? "/platform/home/fury-hd-optimized.webp" : theme.iconUrl}')`,
  } as CSSProperties;

  if (!data) return <ErrorState theme={theme} />;

  const totalAvailable = Object.values(budgets).reduce((sum, value) => sum + value, 0);
  const rank = (kind: TalentKind) => rankByTree[kind];
  const buildComplete = (Object.keys(budgets) as TalentKind[]).every((kind) => rankByTree[kind] === budgets[kind]);
  const missingPoints = Math.max(0, totalAvailable - spent);
  const ragePercent = Math.round((spent / Math.max(1, totalAvailable)) * 100);
  const specPanelIcon = theme.iconUrl !== theme.classIconUrl
    ? theme.iconUrl
    : data.trees.spec.nodes.find((node) => node.entryNode)?.choices.find((choice) => choice.iconUrl)?.iconUrl
      ?? data.trees.spec.nodes.flatMap((node) => node.choices).find((choice) => choice.iconUrl)?.iconUrl
      ?? theme.classIconUrl;
  const heroPanelIcon = data.trees.hero.nodes.find((node) => node.entryNode)?.choices.find((choice) => choice.iconUrl)?.iconUrl
    ?? data.trees.hero.nodes.flatMap((node) => node.choices).find((choice) => choice.iconUrl)?.iconUrl
    ?? data.heroIconUrl;
  const buildSaved = savedSignature === currentSignature;

  const showNotice = (message: string, persistent = false) => setNotice({ message, persistent });
  const reset = () => {
    if (spent === 0 && !pvpSelections.some((id) => id !== null)) { setLoadoutOpen(false); return; }
    setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
    setInvalidLoadout(false); setRanks(freeTalentRanks(data)); setChoices(new Map()); setPvpSelections([null, null, null]); showNotice("Таланты сброшены — можно отменить", true); setLoadoutOpen(false);
  };
  const undoReset = () => { if (!undoState) return; setRanks(new Map(undoState.ranks)); setChoices(new Map(undoState.choices)); setPvpSelections([...undoState.pvp]); setUndoState(null); showNotice("Сборка восстановлена"); };
  const copyText = async (value: string, success: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Legacy clipboard fallback failed");
      }
      showNotice(success);
    } catch {
      window.prompt("Скопируйте вручную", value);
      showNotice("Ссылка подготовлена — скопируйте её из окна", true);
    }
    setLoadoutOpen(false);
  };
  const buildShareUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("import");
    if (ranks.size > 0 || pvpSelections.some((id) => id !== null)) url.searchParams.set("loadout", encodeLoadout(ranks, choices, pvpSelections));
    else url.searchParams.delete("loadout");
    return url.toString();
  };
  const copyShareLink = async () => copyText(buildShareUrl(), "Ссылка на сборку скопирована");
  const copyJson = async () => copyText(JSON.stringify({ v: 2, build: data.buildVersion, ranks: [...ranks.entries()], choices: [...choices.entries()], pvp: pvpSelections }, null, 2), "JSON сборки скопирован");
  const persistBuilds = (builds: SavedTalentBuild[], activeId: string | null) => {
    try {
      window.localStorage.setItem(buildLibraryKey(theme.slug), JSON.stringify(builds));
      if (activeId) window.localStorage.setItem(activeBuildKey(theme.slug), activeId);
      else window.localStorage.removeItem(activeBuildKey(theme.slug));
      return true;
    } catch {
      showNotice("Браузер запретил локальное сохранение — разреши данные сайта", true);
      return false;
    }
  };
  const saveBuild = (asCopy = false) => {
    const name = buildName.trim() || defaultBuildName;
    const loadout = encodeLoadout(ranks, choices, pvpSelections);
    const targetId = !asCopy && activeBuildId && savedBuilds.some((build) => build.id === activeBuildId) ? activeBuildId : createBuildId(theme.slug);
    const targetName = asCopy ? `${name} — копия`.slice(0, 48) : name.slice(0, 48);
    const record: SavedTalentBuild = { id: targetId, name: targetName, loadout, savedAt: new Date().toISOString(), buildVersion: data.buildVersion };
    const nextBuilds = [record, ...savedBuilds.filter((build) => build.id !== targetId)].slice(0, 24);
    if (!persistBuilds(nextBuilds, targetId)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("import");
    url.searchParams.set("loadout", loadout);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setSavedBuilds(nextBuilds); setActiveBuildId(targetId); setBuildName(targetName); setSavedSignature(loadout); setLoadoutOpen(false);
    showNotice(asCopy ? "Копия сборки сохранена" : `Билд «${targetName}» сохранён на этом устройстве`);
  };
  const loadSavedBuild = (build: SavedTalentBuild) => {
    const decoded = decodeLoadout(build.loadout);
    if (!decoded) { showNotice("Эта сохранённая сборка повреждена", true); return; }
    const next = sanitizeLoadout(data, decoded);
    setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
    const signature = encodeLoadout(next.ranks, next.choices, next.pvp);
    setRanks(next.ranks); setChoices(next.choices); setPvpSelections(next.pvp); setBuildName(build.name); setActiveBuildId(build.id); setSavedSignature(signature); setInvalidLoadout(false);
    persistBuilds(savedBuilds, build.id);
    const url = new URL(window.location.href); url.searchParams.delete("import"); url.searchParams.set("loadout", signature); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setLoadoutOpen(false); showNotice(`Загружено: ${build.name}`);
  };
  const deleteSavedBuild = (build: SavedTalentBuild) => {
    if (!window.confirm(`Удалить сборку «${build.name}»?`)) return;
    const nextBuilds = savedBuilds.filter((item) => item.id !== build.id);
    const nextActiveId = activeBuildId === build.id ? null : activeBuildId;
    if (!persistBuilds(nextBuilds, nextActiveId)) return;
    setSavedBuilds(nextBuilds);
    if (activeBuildId === build.id) { setActiveBuildId(null); setSavedSignature(null); }
    showNotice("Сборка удалена");
  };
  const createNewBuild = () => {
    setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
    setRanks(freeTalentRanks(data)); setChoices(new Map()); setPvpSelections([null, null, null]); setBuildName(`Новый билд: ${theme.specNameRu}`); setActiveBuildId(null); setSavedSignature(null); setInvalidLoadout(false); setLoadoutOpen(false);
    persistBuilds(savedBuilds, null);
    const url = new URL(window.location.href); url.searchParams.delete("loadout"); url.searchParams.delete("import"); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    showNotice("Создана новая сборка — можно отменить", true);
  };
  const openImportDialog = () => { setImportValue(""); setImportError(""); setLoadoutOpen(false); setImportOpen(true); };
  const applyImport = () => {
    const raw = importValue.trim();
    if (!raw) { setImportError("Вставь строку, ссылку или JSON сборки."); return; }
    let decoded: ReturnType<typeof decodeLoadout> = null;
    let source = raw;
    try {
      const url = new URL(raw);
      const encoded = url.searchParams.get("loadout");
      const wowImport = url.searchParams.get("import");
      if (encoded) decoded = decodeLoadout(encoded);
      else if (wowImport) source = wowImport;
    } catch { /* Not a URL; continue with the compact, JSON and Blizzard formats. */ }
    if (!decoded) {
      try {
        const parsed = JSON.parse(raw) as { loadout?: unknown; ranks?: unknown; choices?: unknown; pvp?: unknown };
        if (typeof parsed.loadout === "string") decoded = decodeLoadout(parsed.loadout);
        else if (Array.isArray(parsed.ranks)) decoded = {
          ranks: new Map(parsed.ranks.filter((entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(Number(entry[1]))).map(([id, value]) => [id, Number(value)])),
          choices: new Map(Array.isArray(parsed.choices) ? parsed.choices.filter((entry): entry is [string, number] => Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(Number(entry[1]))).map(([id, value]) => [id, Number(value)]) : []),
          pvp: Array.isArray(parsed.pvp) ? parsed.pvp.map((value) => value === null ? null : Number.isFinite(Number(value)) ? Number(value) : null).slice(0, 3) : [],
        };
      } catch { /* Not JSON; continue. */ }
    }
    decoded ??= decodeLoadout(source);
    if (!decoded) {
      const wowDecoded = decodeWoWTalentLoadout(data, source);
      if (wowDecoded) decoded = { ...wowDecoded, pvp: [null, null, null] };
    }
    if (!decoded) { setImportError("Формат не распознан. Поддерживаются Blizzard/SimulationCraft, ссылка Gildra, код и JSON."); return; }
    const next = sanitizeLoadout(data, decoded);
    setUndoState({ ranks: new Map(ranks), choices: new Map(choices), pvp: [...pvpSelections] });
    setRanks(next.ranks); setChoices(next.choices); setPvpSelections(next.pvp); setInvalidLoadout(false); setBuildName(`Импорт: ${theme.specNameRu}`); setActiveBuildId(null); setSavedSignature(null); setImportOpen(false); setImportError("");
    const loadout = encodeLoadout(next.ranks, next.choices, next.pvp);
    const url = new URL(window.location.href); url.searchParams.delete("import"); url.searchParams.set("loadout", loadout); window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setNotice({ message: next.adjusted ? "Сборка импортирована; недоступные узлы пропущены" : "Сборка импортирована — сохрани её в библиотеку" });
  };
  const useInRotation = () => {
    if (!buildComplete) return showNotice(`Распредели ещё ${missingPoints} очк., чтобы SimulationCraft принял билд`, true);
    const talentLoadout = encodeWoWTalentLoadout(data, ranks, choices);
    try {
      window.sessionStorage.setItem(TALENT_HANDOFF_STORAGE_KEY, JSON.stringify({ talentLoadout, talentBuildName: buildName.trim() || defaultBuildName }));
    } catch { /* URL handoff below remains available when storage is restricted. */ }
    const destination = new URL(returnTo, window.location.origin);
    destination.searchParams.set("talentLoadout", talentLoadout);
    destination.searchParams.set("talentBuildName", buildName.trim() || defaultBuildName);
    router.push(`${destination.pathname}${destination.search}`);
  };

  const activePvpTalent = pvpPickerSlot === null ? null : pvpById.get(pvpSelections[pvpPickerSlot] ?? -1);

  return (
    <main ref={calculatorRef} className={`talent-calculator${rotationFlow ? " is-rotation-flow" : ""}`} data-spec={theme.slug} data-hero={data.heroSubtreeId} data-spec-motif={theme.motif} data-performance={performanceTier} data-page-active="true" style={themeStyle}>
      <span className="tc-fury-vignette" aria-hidden="true" />
      <span className="tc-fury-impact" aria-hidden="true" />
      <header className="tc-header">
        <Link className="tc-brand-lockup" href={localePrefix || "/"} prefetch={false}>GILDRA</Link>
        <Link className="tc-game-select" href={`${localePrefix}/wow`} prefetch={false} aria-label="World of Warcraft — открыть командный центр"><Image src="/platform/icons/wow.svg" alt="" width={22} height={22} /><span>World of Warcraft</span><ChevronDown /></Link>
        <SpecMenu current={theme} localePrefix={localePrefix} />
        <nav className="tc-main-nav" aria-label="Разделы World of Warcraft"><Link href={`${localePrefix}/talents/fury-warrior`} prefetch={false}>Спеки</Link><Link href={`${localePrefix}/wow/mythic-plus`} prefetch={false}>Mythic+</Link><Link href={`${localePrefix}/wow/raids`} prefetch={false}>Рейд</Link><Link className="is-active" href={`${localePrefix}/talents/fury-warrior`} prefetch={false} aria-current="page">Таланты</Link><Link href={`${localePrefix}/wow`} prefetch={false}>Гайды</Link></nav>
        <TalentHeaderSearch query={query} onQueryChange={updateTalentQuery} />
        <Link className="tc-account" href={`${localePrefix}/profile/arcanist?tab=gear`} prefetch={false} aria-label="Открыть профиль"><UserRound /></Link>
      </header>
      <section className="tc-commandbar" aria-label="Управление сборкой">
        <div className="tc-page-title">
          <span className="tc-fury-portrait tc-spec-icon"><Image src={theme.iconUrl} alt="" width={64} height={64} sizes="58px" quality={90} priority /><i /></span>
          <div>
            {rotationFlow ? <button type="button" onClick={() => router.push(returnTo)}>← Rotation Lab</button> : null}
            <span className="tc-title-tags"><b>{theme.classNameRu}</b><b>{theme.specNameRu}</b><b>{data.heroName}</b></span>
            <h1><span className="tc-title-prefix">Таланты</span> «{theme.specNameRu}»</h1>
            <span className="tc-build-version">
              {theme.specName} {theme.className} · Midnight {data.buildVersion} · {theme.fantasy} ·{" "}
              <a href={data.source.url} target="_blank" rel="noreferrer">
                {data.source.kind === "community_snapshot" ? "community snapshot: Raidbots" : data.source.label}
              </a>{" "}
              · снимок {new Date(data.source.observedAt).toLocaleString("ru-RU", { timeZone: "UTC" })} UTC
            </span>
          </div>
        </div>
        <div className="tc-command-actions">
          <div className="tc-points-badge" data-resource-state={spent === 0 ? "empty" : spent === totalAvailable ? "complete" : "active"} style={{ "--tc-rage-level": `${ragePercent}%` } as CSSProperties} aria-label={`Распределено ${spent} из ${totalAvailable} очков — ${ragePercent}%`}>
            <span className="tc-rage-emblem" aria-hidden="true"><ResourceGlyph motif={theme.motif} /><i /></span>
            <span className="tc-rage-copy"><small>{theme.resourceLabel}</small><b>{spent}<i> / {totalAvailable}</i></b></span>
            <span className="tc-rage-meter" aria-hidden="true"><strong className="tc-rage-percent">{ragePercent}%</strong><progress value={spent} max={totalAvailable} /></span>
          </div>
          <div className="tc-loadout-menu" ref={loadoutMenuRef}>
            <button ref={loadoutTriggerRef} className="tc-build-select" type="button" aria-label={`Сборка: ${buildName}. Открыть библиотеку`} aria-haspopup="menu" aria-controls="tc-loadout-menu" aria-expanded={loadoutOpen} onClick={() => setLoadoutOpen((open) => !open)}><span><small>{buildSaved ? "Сохранено" : "Есть изменения"}</small><b>{buildName}</b></span><ChevronDown /></button>
            {loadoutOpen ? <div className="tc-loadout-popover" id="tc-loadout-menu" role="menu" aria-label="Библиотека сборок">
              <div className="tc-build-popover-head"><span><small>Библиотека билдов</small><b>{savedBuilds.length} сохранено</b></span><button type="button" role="menuitem" tabIndex={-1} onClick={createNewBuild}><Plus />Новый</button></div>
              <label className="tc-build-name"><span>Название текущего билда</span><input value={buildName} maxLength={48} onChange={(event) => { setBuildName(event.target.value); setSavedSignature(null); }} /></label>
              <div className="tc-build-actions"><button type="button" role="menuitem" tabIndex={-1} onClick={() => saveBuild(false)}><Save />{activeBuildId ? "Сохранить изменения" : "Сохранить билд"}</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => saveBuild(true)}>Сохранить копию</button></div>
              <div className="tc-build-list" role="group" aria-label="Сохранённые сборки">
                {savedBuilds.map((build) => <div className={`tc-build-row${build.id === activeBuildId ? " is-active" : ""}`} key={build.id}><button type="button" role="menuitem" tabIndex={-1} onClick={() => loadSavedBuild(build)}><span>{build.name}</span><small>{new Date(build.savedAt).toLocaleDateString("ru-RU")} · {build.buildVersion}</small></button><button type="button" role="menuitem" tabIndex={-1} aria-label={`Удалить сборку ${build.name}`} onClick={() => deleteSavedBuild(build)}><Trash2 /></button></div>)}
                {!savedBuilds.length ? <p>Сохранённых билдов пока нет.</p> : null}
              </div>
              <div className="tc-build-tools"><button type="button" role="menuitem" tabIndex={-1} onClick={openImportDialog}><Upload />Импорт</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => void copyShareLink()}><Share2 />Ссылка</button><button type="button" role="menuitem" tabIndex={-1} onClick={() => void copyJson()}><Download />JSON</button><button type="button" role="menuitem" tabIndex={-1} onClick={reset}><RotateCcw />Сброс</button></div>
            </div> : null}
          </div>
          <button className="tc-command-button" type="button" disabled={!undoState} onClick={undoReset}><Undo2 /><span>Отменить</span></button>
          <button className="tc-command-button" type="button" onClick={openImportDialog}><Download /><span>Импорт</span></button>
          <button className="tc-command-button is-reset" type="button" onClick={reset}><RotateCcw /><span>Сброс</span></button>
          <button className="tc-command-button is-share" type="button" onClick={() => void copyShareLink()}><Share2 /><span>Поделиться</span></button>
        </div>
      </section>
      <div className="tc-mobile-tree-switcher" role="group" aria-label="Выбор дерева талантов">
        {([['class', 'Класс', data.className], ['hero', 'Путь героя', data.heroName], ['spec', 'Специализация', data.specName]] as const).map(([kind, label, name]) => <button key={kind} type="button" aria-label={`${label}: ${name}`} aria-pressed={mobileTree === kind} onClick={() => setMobileTree(kind)}>{label}</button>)}
      </div>
      <section className="tc-workspace" data-mobile-tree={mobileTree}>
        {!compactLayout || mobileTree === "class" ? <TalentTreePanel variant="class" eyebrow="Основа класса" title={data.className} iconSrc={theme.classIconUrl} spent={rank("class")} budget={budgets.class} nodeCount={data.trees.class.nodes.length}><TalentTreeView tree={data.trees.class} ranks={treeRanks.class} choices={treeChoices.class} spentInTree={rank("class")} nodeCatalog={nodeCatalog} searchIndex={searchableChoicesByNode} onRank={changeRank} onCycleChoice={cycleChoice} query={deferredQuery} openTooltip={openTooltip} closeTooltip={closeTooltip} /></TalentTreePanel> : null}
        {!compactLayout || mobileTree === "hero" ? mountedTrees.has("hero") ? <TalentTreePanel variant="hero" eyebrow="Путь героя" title={data.heroName} iconSrc={heroPanelIcon} secondary={<nav className="tc-hero-paths" aria-label="Сменить путь героя">{theme.heroPaths.map((hero) => {
          const href = `${localePrefix}/talents/${theme.slug}?hero=${hero.id}`;
          return <Link key={hero.id} className={hero.id === data.heroSubtreeId ? "is-active" : undefined} href={href} prefetch={false} scroll={false} aria-current={hero.id === data.heroSubtreeId ? "page" : undefined} onClick={(event) => { navigateTalentPage(event, href, () => router.push(href, { scroll: false })); }}>{hero.nameRu}</Link>;
        })}</nav>} spent={rank("hero")} budget={budgets.hero} nodeCount={data.trees.hero.nodes.length}><TalentTreeView tree={data.trees.hero} ranks={treeRanks.hero} choices={treeChoices.hero} spentInTree={rank("hero")} nodeCatalog={nodeCatalog} searchIndex={searchableChoicesByNode} onRank={changeRank} onCycleChoice={cycleChoice} query={deferredQuery} openTooltip={openTooltip} closeTooltip={closeTooltip} /></TalentTreePanel> : <TalentTreePanel variant="hero" eyebrow="Путь героя" title={data.heroName} spent={0} budget={budgets.hero} nodeCount={data.trees.hero.nodes.length} loading><div className="tc-skeleton-tree" /></TalentTreePanel> : null}
        {!compactLayout || mobileTree === "spec" ? mountedTrees.has("spec") ? <TalentTreePanel variant="spec" eyebrow="Специализация" title={data.specName} iconSrc={specPanelIcon} spent={rank("spec")} budget={budgets.spec} nodeCount={data.trees.spec.nodes.length} scene={<SpecSignatureFx specSlug={theme.slug} />}><TalentTreeView tree={data.trees.spec} ranks={treeRanks.spec} choices={treeChoices.spec} spentInTree={rank("spec")} nodeCatalog={nodeCatalog} searchIndex={searchableChoicesByNode} onRank={changeRank} onCycleChoice={cycleChoice} query={deferredQuery} openTooltip={openTooltip} closeTooltip={closeTooltip} /></TalentTreePanel> : <TalentTreePanel variant="spec" eyebrow="Специализация" title={data.specName} spent={0} budget={budgets.spec} nodeCount={data.trees.spec.nodes.length} loading><div className="tc-skeleton-tree" /></TalentTreePanel> : null}
      </section>
      <footer className="tc-toolbar">
        <div className="tc-toolbar-group tc-toolbar-primary">
          <TalentSearchField count={matchingTalentCount} onQueryChange={updateTalentQuery} />
          <button className="tc-import" type="button" onClick={openImportDialog}><Upload /><span>Импорт сборки</span></button>
        </div>
        <div className="tc-toolbar-divider" />
        {!data.pvpTalents.length ? <div className="tc-pvp-group" aria-label="PvP-таланты загружаются"><span className="tc-pvp-label">PvP-таланты</span>{[1, 2, 3].map((slot) => <button className="tc-pvp-slot" key={slot} type="button" disabled aria-label={`PvP-талант ${slot}: данные пока недоступны`}><span>+</span><small>{slot}</small></button>)}</div> : null}
        <div className="tc-toolbar-spacer" />
        {data.pvpTalents.length ? <div className="tc-pvp-group" role="group" aria-labelledby="tc-pvp-label">
          <span className="tc-pvp-label" id="tc-pvp-label"><b>{pvpSelections.filter((id) => id !== null).length}/3</b> PvP-таланты</span>
          {[0, 1, 2].map((slot) => {
            const talent = pvpById.get(pvpSelections[slot] ?? -1);
            const visual = talent ? pvpVisualTheme(talent) : null;
            const slotTooltipId = tooltip?.kind === "pvp" && talent && tooltip.talent.externalId === talent.externalId ? `tooltip-pvp-${talent.externalId}` : undefined;
            return <button
              className={`tc-pvp-slot${talent ? ` is-filled tc-vfx-${visual?.theme}` : ""}`}
              key={slot}
              ref={(element) => { pvpSlotRefs.current[slot] = element; }}
              type="button"
              data-pvp-slot={slot}
              data-pvp-id={talent?.externalId}
              data-pvp-theme={visual?.theme}
              aria-label={`PvP-талант ${slot + 1}: ${talent?.name ?? "не выбран"}. Нажмите, чтобы ${talent ? "заменить" : "выбрать"}${talent ? "; контекстное меню удаляет талант" : ""}`}
              aria-describedby={slotTooltipId}
              aria-haspopup="dialog"
              aria-controls={pvpPickerSlot === null ? undefined : "tc-pvp-picker"}
              aria-expanded={pvpPickerSlot === slot}
              title={talent ? `${talent.name} · нажмите для замены · правый клик для удаления` : `Выбрать PvP-талант в слот ${slot + 1}`}
              onMouseEnter={(event) => { if (talent) openPvpTooltip(talent, event.currentTarget); }}
              onMouseLeave={closeTooltip}
              onFocus={(event) => { if (talent) openPvpTooltip(talent, event.currentTarget, true); }}
              onBlur={closeTooltip}
              onClick={() => openPvpPicker(slot)}
              onContextMenu={(event) => { if (!talent) return; event.preventDefault(); closeTooltip(); clearPvpTalent(slot); }}
            >
              {talent?.iconUrl ? <img src={talent.iconUrl} alt="" loading="lazy" decoding="async" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; event.currentTarget.dataset.iconSource = "fallback"; }} /> : <span className="tc-pvp-plus" aria-hidden="true">+</span>}
              {visual ? <TalentSigil visual={visual} /> : <i className="tc-pvp-empty-rune" aria-hidden="true" />}
              <small>{slot + 1}</small>
              <i className="tc-pvp-slot-state" aria-hidden="true" />
            </button>;
          })}
        </div> : null}
        <div className="tc-toolbar-summary"><span className="tc-total-points"><b>{spent}</b> / {totalAvailable} очк.</span></div>
        <button type="button" className={`tc-use-rotation${buildSaved && !rotationFlow ? " is-saved" : ""}`} disabled={rotationFlow && !buildComplete} onClick={rotationFlow ? useInRotation : () => saveBuild(false)}><span className="tc-save-mark" aria-hidden="true">{buildSaved && !rotationFlow ? <Check /> : <Save />}</span><span className="tc-save-copy"><b>{rotationFlow ? (buildComplete ? "Использовать в тренере" : `Осталось ${missingPoints} очк.`) : buildSaved ? "Сборка сохранена" : activeBuildId ? "Сохранить изменения" : "Сохранить сборку"}</b><small>{rotationFlow ? (buildComplete ? "Готово для SimulationCraft" : "Распредели все очки") : `${spent}/${totalAvailable} очк. · ${savedBuilds.length} в библиотеке`}</small></span></button>
        {notice ? <div className="tc-toast" role="status" aria-live="polite"><span>{notice.message}</span>{undoState ? <button type="button" onClick={undoReset}>Отменить</button> : null}{notice.persistent ? <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice(null)}>×</button> : null}</div> : null}
      </footer>
      {importOpen ? <div className="tc-import-backdrop" aria-hidden="true" onClick={closeImport} /> : null}
      {importOpen ? <div className="tc-import-dialog" ref={importDialogRef} role="dialog" aria-modal="true" aria-labelledby="tc-import-title" aria-describedby="tc-import-description">
        <header><span><small>{theme.specName} Loadout Gateway</small><h2 id="tc-import-title">Импорт сборки</h2></span><button type="button" aria-label="Закрыть импорт" onClick={closeImport}><X /></button></header>
        <p id="tc-import-description">Вставь строку талантов Blizzard или SimulationCraft, ссылку Gildra, компактный код либо JSON. Мы проверим узлы и не дадим загрузить повреждённую сборку.</p>
        <label><span>Данные сборки</span><textarea data-build-import value={importValue} onChange={(event) => { setImportValue(event.target.value); setImportError(""); }} placeholder="CIEAAAAAAAAAAAAAAAAAAAAAAMjZmZmZmxM..." spellCheck={false} /></label>
        {importError ? <div className="tc-import-error" role="alert"><b>Не удалось импортировать</b><span>{importError}</span></div> : <div className="tc-import-formats" aria-label="Поддерживаемые форматы"><span>Blizzard</span><span>SimulationCraft</span><span>Gildra URL</span><span>JSON</span></div>}
        <footer><button type="button" className="tc-import-cancel" onClick={closeImport}>Отмена</button><button type="button" className="tc-import-apply" data-build-import-apply onClick={applyImport} disabled={!importValue.trim()}><Upload />Проверить и загрузить</button></footer>
      </div> : null}
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker-backdrop" aria-hidden="true" onClick={closePvpPicker} /> : null}
      {pvpPickerSlot !== null ? <div className="tc-pvp-picker" id="tc-pvp-picker" ref={pvpPickerRef} role="dialog" aria-modal="true" aria-labelledby="tc-pvp-picker-title">
        <div className="tc-pvp-picker-head">
          <div><span className="tc-state-kicker">Midnight · {theme.specName} · PvP arsenal</span><h2 id="tc-pvp-picker-title">{activePvpTalent ? "Заменить PvP-талант" : "Выбрать PvP-талант"}</h2></div>
          <button type="button" className="tc-pvp-close" aria-label="Закрыть выбор PvP-таланта" onClick={closePvpPicker}>×</button>
        </div>
        <div className="tc-pvp-picker-slots" aria-label="Текущие PvP-слоты">
          {[0, 1, 2].map((slot) => { const selectedTalent = pvpById.get(pvpSelections[slot] ?? -1); return <span className={`${slot === pvpPickerSlot ? "is-active" : ""}${selectedTalent ? " is-filled" : ""}`} key={slot}><b>{slot + 1}</b>{selectedTalent?.iconUrl ? <img src={selectedTalent.iconUrl} alt="" /> : <i aria-hidden="true">+</i>}<small>{selectedTalent?.name ?? "Свободно"}</small></span>; })}
        </div>
        <label className="tc-pvp-picker-search"><Search aria-hidden="true" /><span className="sr-only">Поиск PvP-талантов</span><input data-pvp-search type="search" value={pvpQuery} onChange={(event) => setPvpQuery(event.target.value)} placeholder="Найти талант или эффект…" /><kbd>↓</kbd></label>
        <p className="tc-pvp-picker-hint"><span>Слот {pvpPickerSlot + 1} · каждый талант можно поставить только один раз</span><b aria-live="polite">{filteredPvpTalents.length} из {data.pvpTalents.length}</b></p>
        <div className="tc-pvp-options" role="listbox" aria-label={`PvP-таланты ${theme.specNameRu}`}>
          {filteredPvpTalents.map((talent, index) => {
            const selectedSlot = pvpSelections.findIndex((id) => id === talent.externalId);
            const selectedHere = selectedSlot === pvpPickerSlot;
            const disabled = selectedSlot >= 0 && !selectedHere;
            const optionTooltipId = tooltip?.kind === "pvp" && tooltip.talent.externalId === talent.externalId ? `tooltip-pvp-${talent.externalId}` : undefined;
            const firstAvailable = filteredPvpTalents.find((item) => !pvpSelections.some((id, slotIndex) => id === item.externalId && slotIndex !== pvpPickerSlot))?.externalId;
            const visual = pvpVisualTheme(talent);
            return <button
              className={`tc-pvp-option tc-vfx-${visual.theme}`}
              style={{ "--tc-pvp-option-delay": `${Math.min(index * 32, 224)}ms` } as CSSProperties}
              key={talent.externalId}
              type="button"
              data-pvp-option="true"
              data-pvp-picker-id={talent.externalId}
              data-pvp-theme={visual.theme}
              role="option"
              tabIndex={!disabled && talent.externalId === firstAvailable ? 0 : -1}
              aria-selected={selectedHere}
              disabled={disabled}
              aria-label={disabled ? `${talent.name}. Уже выбран в слоте ${selectedSlot + 1}` : talent.name}
              aria-describedby={optionTooltipId}
              onMouseEnter={(event) => openPvpTooltip(talent, event.currentTarget)}
              onMouseLeave={closeTooltip}
              onFocus={(event) => openPvpTooltip(talent, event.currentTarget, true)}
              onBlur={closeTooltip}
              onClick={() => choosePvpTalent(talent.externalId)}
            >
              <span className="tc-pvp-option-art"><img src={talent.iconUrl || UNVERIFIED_ICON_URL} alt="" data-icon-source={talent.iconSource} onError={(event) => { event.currentTarget.src = UNVERIFIED_ICON_URL; event.currentTarget.dataset.iconSource = "fallback"; }} /><TalentSigil visual={visual} /></span>
              <span className="tc-pvp-option-copy"><strong>{talent.name}</strong><small>{talent.description}</small></span>
              <span className="tc-pvp-option-action">{selectedHere ? <><b aria-hidden="true">✓</b> Выбран</> : disabled ? <>Слот {selectedSlot + 1}</> : <>Выбрать</>}</span>
            </button>;
          })}
          {!filteredPvpTalents.length ? <div className="tc-pvp-empty" role="status"><span aria-hidden="true">⌕</span><strong>Ничего не найдено</strong><small>Попробуйте название способности или часть описания.</small><button type="button" onClick={() => setPvpQuery("")}>Сбросить поиск</button></div> : null}
        </div>
        <div className="tc-pvp-picker-foot"><span><b>{pvpSelections.filter((id) => id !== null).length}</b>/3 слота занято</span><button type="button" className="tc-pvp-clear" data-pvp-remove="true" onClick={() => { clearPvpTalent(pvpPickerSlot); closePvpPicker(); }} disabled={!activePvpTalent}>Убрать из слота {pvpPickerSlot + 1}</button></div>
      </div> : null}
      <TreeTooltipLayer ref={treeTooltipLayerRef} theme={theme} ranks={ranks} choices={choices} nodeCatalog={nodeCatalog} data={data} />
      {tooltip && typeof document !== "undefined" ? createPortal(
        <div className="tc-tooltip-layer" data-spec={theme.slug} data-spec-motif={theme.motif} style={{ "--tc-accent": theme.accent, "--tc-hot": theme.hot, "--tc-deep": theme.deep, "--tc-accent-rgb": theme.accentRgb, "--tc-hot-rgb": theme.hotRgb, "--tc-ambient-rgb": theme.ambientRgb } as CSSProperties}>
          <PvpTooltip talent={tooltip.talent} left={tooltip.left} top={tooltip.top} anchorOffset={tooltip.anchorOffset} placement={tooltip.placement} motion={tooltipMotion} selected={pvpSelections.includes(tooltip.talent.externalId)} id={`tooltip-pvp-${tooltip.talent.externalId}`} />
        </div>,
        document.body,
      ) : null}
    </main>
  );
}
