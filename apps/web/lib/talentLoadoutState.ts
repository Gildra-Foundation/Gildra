// Build state of the public talent calculator (/talents/<spec>): which nodes are
// open, what a rank change does to the rest of the tree, and how a build travels
// (URL, in-game string, compact code, JSON). Pure functions; the page keeps the state.
import type { TalentCalculatorData, TalentKind, TalentNode, TalentTree } from "@/lib/talentCalculatorData";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout, peekWoWTalentLoadout } from "@/lib/wowTalentLoadout";

export type RankMap = Map<string, number>;
export type ChoiceMap = Map<string, number>;
export type PvpSlots = Array<number | null>;
export type Loadout = { ranks: RankMap; choices: ChoiceMap; pvp: PvpSlots };
export type SanitizedLoadout = Loadout & { adjusted: boolean };
export type TalentNodeCatalog = Map<number, TalentNode[]>;
export type NodeAvailability = { available: boolean; reason: string; blockerNodeIds: string[] };
/** Words the availability check needs; the page passes its interface copy. */
export type AvailabilityCopy = {
  talentFallback: (nodeId: number) => string;
  chooseOne: (name: string) => string;
  chooseAnyOf: (names: string[]) => string;
  spendMore: (points: number) => string;
};

export const TALENT_KINDS = ["class", "hero", "spec"] as const satisfies readonly TalentKind[];
export const EMPTY_PVP: PvpSlots = [null, null, null];

export const kindOfNode = (id: string) => id.slice(0, id.indexOf("-")) as TalentKind;

export function countRanks(ranks: RankMap, kind: TalentKind, nodes?: TalentNode[]) {
  const free = new Set(nodes?.filter((node) => node.freeNode).map((node) => node.id) ?? []);
  let total = 0;
  for (const [id, value] of ranks) if (id.startsWith(`${kind}-`) && !free.has(id)) total += value;
  return total;
}

export function countRanksByTree(ranks: RankMap, data: TalentCalculatorData): Record<TalentKind, number> {
  const totals: Record<TalentKind, number> = { class: 0, hero: 0, spec: 0 };
  for (const kind of TALENT_KINDS) {
    for (const node of data.trees[kind].nodes) if (!node.freeNode) totals[kind] += ranks.get(node.id) ?? 0;
  }
  return totals;
}

export function freeTalentRanks(data: TalentCalculatorData): RankMap {
  return new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.filter((node) => node.freeNode).map((node) => [node.id, node.maxRanks] as const)));
}

export function createTalentNodeCatalog(data: TalentCalculatorData | null | undefined): TalentNodeCatalog {
  const catalog: TalentNodeCatalog = new Map();
  if (!data) return catalog;
  for (const node of Object.values(data.trees).flatMap((tree) => tree.nodes)) catalog.set(node.nodeId, [...(catalog.get(node.nodeId) ?? []), node]);
  return catalog;
}

export function talentNodeName(node: TalentNode, copy: Pick<AvailabilityCopy, "talentFallback">) {
  return [...new Set(node.choices.map((choice) => choice.name).filter(Boolean))].join(" / ") || copy.talentFallback(node.nodeId);
}

function catalogNodes(catalog: TalentNodeCatalog, nodeIds: number[], kind?: TalentKind) {
  return nodeIds.flatMap((nodeId) => catalog.get(nodeId) ?? []).filter((node) => !kind || node.id.startsWith(`${kind}-`));
}

function unmetRequirement(nodes: TalentNode[], fallbackIds: number[], ranks: RankMap, copy: AvailabilityCopy) {
  if (nodes.some((candidate) => (ranks.get(candidate.id) ?? 0) > 0)) return null;
  const names = [...new Set(nodes.map((node) => talentNodeName(node, copy)))];
  const labels = names.length ? names : fallbackIds.map((nodeId) => copy.talentFallback(nodeId));
  return { nodeIds: nodes.map((candidate) => candidate.id), text: labels.length === 1 ? copy.chooseOne(labels[0]) : copy.chooseAnyOf(labels) };
}

/** Whether a node can take a rank: the points gate of its tree and one learned node above it. */
export function nodeAvailability(node: TalentNode, kind: TalentKind, ranks: RankMap, spentInTree: number, catalog: TalentNodeCatalog, copy: AvailabilityCopy): NodeAvailability {
  if (node.freeNode) return { available: true, reason: "", blockerNodeIds: [] };
  const spentBeforeNode = Math.max(0, spentInTree - (ranks.get(node.id) ?? 0));
  const reasons: string[] = [];
  const blockers = new Set<string>();
  if (node.requiredPoints && spentBeforeNode < node.requiredPoints) reasons.push(copy.spendMore(node.requiredPoints - spentBeforeNode));
  for (const [ids, ownTree] of [[node.requiresNodeIds, undefined], [node.prevNodeIds, kind]] as const) {
    if (!ids.length) continue;
    const requirement = unmetRequirement(catalogNodes(catalog, ids, ownTree), ids, ranks, copy);
    if (!requirement) continue;
    reasons.push(requirement.text);
    requirement.nodeIds.forEach((id) => blockers.add(id));
  }
  return reasons.length ? { available: false, reason: reasons.join(" · "), blockerNodeIds: [...blockers] } : { available: true, reason: "", blockerNodeIds: [] };
}

const plainCopy: AvailabilityCopy = { talentFallback: (id) => `#${id}`, chooseOne: (name) => name, chooseAnyOf: (names) => names.join(", "), spendMore: (points) => String(points) };

function nodeIndex(data: TalentCalculatorData) {
  const nodes = new Map<string, { node: TalentNode; kind: TalentKind }>();
  for (const kind of TALENT_KINDS) for (const node of data.trees[kind].nodes) nodes.set(node.id, { node, kind });
  return nodes;
}

/** Drops every rank whose node lost its requirement (repeats until the tree is stable). Mutates the maps. */
export function removeInvalidDependents(data: TalentCalculatorData, ranks: RankMap, choices: ChoiceMap, catalog: TalentNodeCatalog = createTalentNodeCatalog(data)) {
  const nodes = nodeIndex(data);
  const spent = countRanksByTree(ranks, data);
  let removed = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...ranks.keys()]) {
      const entry = nodes.get(id);
      const rank = ranks.get(id) ?? 0;
      if (entry && nodeAvailability(entry.node, entry.kind, ranks, spent[entry.kind], catalog, plainCopy).available) continue;
      ranks.delete(id);
      choices.delete(id);
      if (entry && !entry.node.freeNode) { spent[entry.kind] = Math.max(0, spent[entry.kind] - rank); removed += rank; }
      changed = true;
    }
  }
  return removed;
}

/** Keeps only ranks the current trees allow (known nodes, max ranks, requirements, own choices, distinct PvP). */
export function sanitizeLoadout(data: TalentCalculatorData, decoded: { ranks: RankMap; choices: ChoiceMap; pvp?: PvpSlots }): SanitizedLoadout {
  const nodes = nodeIndex(data);
  const ranks: RankMap = new Map();
  let adjusted = false;
  decoded.ranks.forEach((value, id) => {
    const entry = nodes.get(id);
    const rank = Math.floor(Number(value));
    if (entry && Number.isFinite(rank) && rank > 0) {
      ranks.set(id, Math.min(entry.node.maxRanks, rank));
      if (rank > entry.node.maxRanks) adjusted = true;
    } else adjusted = true;
  });
  for (const node of Object.values(data.trees).flatMap((tree) => tree.nodes)) if (node.freeNode && !ranks.has(node.id)) ranks.set(node.id, node.maxRanks);
  const choices: ChoiceMap = new Map();
  if (removeInvalidDependents(data, ranks, choices) > 0) adjusted = true;
  decoded.choices.forEach((value, id) => {
    const node = nodes.get(id)?.node;
    const choiceId = Math.floor(Number(value));
    if (node?.nodeType === "choice" && (ranks.get(id) ?? 0) > 0 && node.choices.some((choice) => choice.externalId === choiceId)) choices.set(id, choiceId);
  });
  ranks.forEach((_rank, id) => {
    const node = nodes.get(id)?.node;
    if (node?.nodeType === "choice" && !choices.has(id) && node.choices[0]) choices.set(id, node.choices[0].externalId);
  });
  const allowedPvp = new Set(data.pvpTalents.map((talent) => talent.externalId));
  const pvp: PvpSlots = [null, null, null];
  const used = new Set<number>();
  (decoded.pvp ?? []).slice(0, 3).forEach((value, index) => {
    if (value === null || value === undefined) return;
    if (allowedPvp.has(value) && !used.has(value)) { pvp[index] = value; used.add(value); } else adjusted = true;
  });
  return { ranks, choices, pvp, adjusted };
}

export function emptyLoadout(data: TalentCalculatorData): SanitizedLoadout {
  return { ranks: freeTalentRanks(data), choices: new Map(), pvp: [...EMPTY_PVP], adjusted: false };
}

/* ---------- Compact code (older shared links: ?loadout=) ---------- */

export function encodeLoadout(ranks: RankMap, choices: ChoiceMap, pvp: PvpSlots) {
  const payload = JSON.stringify({ v: 2, ranks: [...ranks.entries()].sort(([a], [b]) => a.localeCompare(b)), choices: [...choices.entries()].sort(([a], [b]) => a.localeCompare(b)), pvp: pvp.map((id) => id ?? null) });
  return btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function entries(value: unknown) {
  const map = new Map<string, number>();
  if (Array.isArray(value)) for (const entry of value) if (Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(Number(entry[1]))) map.set(entry[0], Number(entry[1]));
  return map;
}

function pvpList(value: unknown): PvpSlots {
  return Array.isArray(value) ? value.slice(0, 3).map((id) => id === null ? null : Number.isFinite(Number(id)) ? Math.floor(Number(id)) : null) : [];
}

export function decodeLoadout(value: string): Loadout | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as { ranks?: unknown; choices?: unknown; pvp?: unknown };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ranks)) return null;
    return { ranks: entries(parsed.ranks), choices: entries(parsed.choices), pvp: pvpList(parsed.pvp) };
  } catch {
    return null;
  }
}

/* ---------- URL state: ?build=<in-game string>&pvp=<id.id.id> ---------- */

export function encodePvp(pvp: PvpSlots) {
  return pvp.some((id) => id !== null) ? pvp.map((id) => id ?? 0).join(".") : "";
}

export function decodePvp(value: string | null): PvpSlots {
  if (!value) return [];
  return value.split(".").slice(0, 3).map((part) => { const id = Math.floor(Number(part)); return Number.isFinite(id) && id > 0 ? id : null; });
}

/** True when the build differs from the empty tree (free nodes only). */
export function hasSpentPoints(ranks: RankMap, pvp: PvpSlots, data: TalentCalculatorData) {
  const totals = countRanksByTree(ranks, data);
  return totals.class + totals.hero + totals.spec > 0 || pvp.some((id) => id !== null);
}

/** Search params that describe a build; `withoutHero` leaves the hero tree out (for the other hero path's page). */
export function buildSearchParams(data: TalentCalculatorData, loadout: Loadout, withoutHero = false) {
  const params = new URLSearchParams();
  const ranks = withoutHero ? new Map([...loadout.ranks].filter(([id]) => !id.startsWith("hero-"))) : loadout.ranks;
  if (!hasSpentPoints(ranks, loadout.pvp, data)) return params;
  params.set("build", encodeWoWTalentLoadout(data, ranks, loadout.choices));
  const pvp = encodePvp(loadout.pvp);
  if (pvp) params.set("pvp", pvp);
  return params;
}

/** The build in a page URL: `build` (in-game string), `loadout` (compact code) or `import`. */
export function loadoutFromSearch(data: TalentCalculatorData, params: URLSearchParams): { loadout: SanitizedLoadout; source: "url" } | { loadout: null; source: "invalid" | "none" } {
  const build = params.get("build") ?? params.get("import");
  const compact = params.get("loadout");
  if (build) {
    const decoded = decodeWoWTalentLoadout(data, build);
    if (!decoded || decoded.truncated) return { loadout: null, source: "invalid" };
    return { loadout: sanitizeLoadout(data, { ranks: decoded.ranks, choices: decoded.choices, pvp: decodePvp(params.get("pvp")) }), source: "url" };
  }
  if (compact) {
    const decoded = decodeLoadout(compact);
    return decoded ? { loadout: sanitizeLoadout(data, decoded), source: "url" } : { loadout: null, source: "invalid" };
  }
  return { loadout: null, source: "none" };
}

/* ---------- Import box ---------- */

export type ImportResult =
  | { kind: "empty" }
  | { kind: "ok"; loadout: SanitizedLoadout }
  /** An in-game string of the same spec that picked the other hero path. */
  | { kind: "other-hero"; value: string }
  /** An in-game string of another specialization. */
  | { kind: "other-spec"; specId: number; value: string }
  | { kind: "damaged" }
  | { kind: "unknown" };

const looksLikeGameString = (value: string) => /^[A-Za-z0-9+/_-]{20,}={0,2}$/.test(value);

/** Reads whatever a player pastes: an in-game/SimulationCraft string, a Gildra or Wowhead link, a compact code or JSON. */
export function parseBuildInput(data: TalentCalculatorData, input: string): ImportResult {
  const raw = input.trim().replace(/^talents=/i, "").replace(/^["']|["']$/g, "");
  if (!raw) return { kind: "empty" };
  const candidates: string[] = [];
  try {
    const url = new URL(raw);
    const fromUrl = loadoutFromSearch(data, url.searchParams);
    if (fromUrl.loadout) return { kind: "ok", loadout: fromUrl.loadout };
    const build = url.searchParams.get("build") ?? url.searchParams.get("import");
    if (build) candidates.push(build);
    else if (fromUrl.source === "invalid") return { kind: "damaged" };
    // Talent calculators (Wowhead and others) put the in-game string in the path.
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last) candidates.push(decodeURIComponent(last));
  } catch {
    candidates.push(raw);
  }
  if (!candidates.length) return { kind: "unknown" };

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { loadout?: unknown; build?: unknown; ranks?: unknown; choices?: unknown; pvp?: unknown };
      if (typeof parsed.build === "string") candidates.unshift(parsed.build);
      else if (typeof parsed.loadout === "string") {
        const decoded = decodeLoadout(parsed.loadout);
        return decoded ? { kind: "ok", loadout: sanitizeLoadout(data, decoded) } : { kind: "damaged" };
      } else if (Array.isArray(parsed.ranks)) {
        return { kind: "ok", loadout: sanitizeLoadout(data, { ranks: entries(parsed.ranks), choices: entries(parsed.choices), pvp: pvpList(parsed.pvp) }) };
      } else return { kind: "unknown" };
    } catch {
      return { kind: "damaged" };
    }
  }

  for (const value of candidates) {
    const header = peekWoWTalentLoadout(value);
    if (header && looksLikeGameString(value)) {
      if (header.version !== 2) return { kind: "damaged" };
      if (header.specId !== data.specId) return { kind: "other-spec", specId: header.specId, value };
      const decoded = decodeWoWTalentLoadout(data, value);
      if (!decoded || decoded.truncated) return { kind: "damaged" };
      if (decoded.heroEntryIndex !== undefined && decoded.heroEntryIndex !== data.heroSelectionEntryIndex) return { kind: "other-hero", value };
      return { kind: "ok", loadout: sanitizeLoadout(data, { ranks: decoded.ranks, choices: decoded.choices }) };
    }
    const compact = decodeLoadout(value);
    if (compact) return { kind: "ok", loadout: sanitizeLoadout(data, compact) };
  }
  return { kind: "unknown" };
}

/* ---------- Tree geometry (game grid) ---------- */

export type TreeEdge = readonly [TalentNode, TalentNode];
export type TreeGeometry = { cellsX: number; cellsY: number; edges: TreeEdge[] };

/** Cells across/down a tree (node x/y are % of the canvas) and its connections, so all trees share one cell size. */
export function treeGeometry(tree: Pick<TalentTree, "nodes">): TreeGeometry {
  const step = (values: number[]) => {
    const sorted = [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((value, index) => value - sorted[index]).filter((gap) => gap > 2);
    return gaps.length ? Math.min(...gaps) : 0;
  };
  const stepX = step(tree.nodes.map((node) => node.x));
  const stepY = step(tree.nodes.map((node) => node.y));
  const cellsX = stepX ? Math.min(12, Math.max(3, 100 / stepX)) : 4;
  const cellsY = stepY ? Math.min(16, 100 / stepY) : 3;
  const byNodeId = new Map(tree.nodes.map((node) => [node.nodeId, node]));
  const edges = tree.nodes.flatMap((node) => node.nextNodeIds.flatMap((nextId) => {
    const target = byNodeId.get(nextId);
    return target ? [[node, target] as const] : [];
  }));
  return { cellsX: Math.round(cellsX * 100) / 100, cellsY: Math.round(Math.max(cellsY, 2) * 100) / 100, edges };
}

export type NodeShape = "square" | "round" | "choice" | "apex";
export const nodeShape = (node: TalentNode): NodeShape => node.nodeType === "choice" ? "choice" : node.nodeType === "tiered" || node.nodeType === "subtree" ? "apex" : node.talentType === "passive" ? "round" : "square";
