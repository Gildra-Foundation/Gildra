import type { TalentCalculatorData, TalentKind } from "@/lib/talentCalculatorData";

export const FURY_REFERENCE_LOADOUT = "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM";
export const TALENT_HANDOFF_STORAGE_KEY = "gildra:talent-calculator:rotation-handoff:v1";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

class BitReader {
  private offset = 0;
  private readonly value: string;
  constructor(value: string) { this.value = value; }
  hasOnlyPadding() {
    const remaining = this.value.length * 6 - this.offset;
    return remaining < 6 && this.read(remaining) === 0;
  }
  read(width: number) {
    if (this.offset + width > this.value.length * 6) throw new Error("Truncated talent loadout");
    let result = 0;
    for (let index = 0; index < width; index += 1) {
      const character = alphabet.indexOf(this.value[Math.floor(this.offset / 6)] ?? "");
      if (character < 0) throw new Error("Invalid talent loadout alphabet");
      result |= ((character >> (this.offset % 6)) & 1) << index;
      this.offset += 1;
    }
    return result;
  }
}

class BitWriter {
  private offset = 0;
  private character = 0;
  private output = "";
  write(width: number, value: number) {
    for (let index = 0; index < width; index += 1) {
      this.character |= ((value >> index) & 1) << (this.offset % 6);
      this.offset += 1;
      if (this.offset % 6 === 0) {
        this.output += alphabet[this.character];
        this.character = 0;
      }
    }
  }
  finish() {
    if (this.offset % 6) this.output += alphabet[this.character];
    return this.output;
  }
}

function visibleNodes(data: TalentCalculatorData) {
  return new Map(Object.values(data.trees).flatMap((tree) => tree.nodes.map((node) => [node.nodeId, node] as const)));
}

function readWoWTalentLoadout(data: TalentCalculatorData, value: string) {
  try {
    if (!value || !/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const reader = new BitReader(normalized);
    if (reader.read(8) !== 2 || reader.read(16) !== data.specId) return null;
    const hash = Array.from({ length: 16 }, () => reader.read(8));
    // Blizzard explicitly permits an all-zero hash for third-party exports.
    // A real in-game hash must match the source tree, never be silently ignored.
    if (hash.some(byte => byte !== 0) && hash.map(byte => byte.toString(16).padStart(2, "0")).join("") !== data.treeHash?.toLowerCase()) return null;
    const metadata = new Map(data.loadoutNodes.map((node) => [node.nodeId, node]));
    const visible = visibleNodes(data);
    const ranks = new Map<string, number>();
    const choices = new Map<string, number>();
    let heroEntryIndex: number | null = null;
    for (const nodeId of data.fullNodeOrder) {
      const node = metadata.get(nodeId);
      const selected = reader.read(1) === 1;
      if (!selected) continue;
      const selector = nodeId === data.heroSelectionNodeId;
      if (!node && !selector) return null;
      const purchased = reader.read(1) === 1;
      if (!purchased) {
        const freeTalentNode = visible.get(nodeId);
        if (freeTalentNode?.freeNode) ranks.set(freeTalentNode.id, freeTalentNode.maxRanks);
        continue;
      }
      const partiallyRanked = reader.read(1) === 1;
      const rank = partiallyRanked ? reader.read(6) : Math.max(1, node?.maxRanks ?? 1);
      const isChoice = reader.read(1) === 1;
      const choiceIndex = isChoice ? reader.read(2) : 0;
      if (selector) {
        if (!isChoice || rank !== 1) return null;
        heroEntryIndex = choiceIndex;
        continue;
      }
      if (rank < 1 || rank > (node?.maxRanks ?? 1)) return null;
      if (isChoice && (!node?.choiceEntryIds[choiceIndex] || !["choice", "subtree"].includes(node.nodeType))) return null;
      if (!isChoice && node?.nodeType === "choice") return null;
      const talentNode = visible.get(nodeId);
      if (!talentNode) continue;
      ranks.set(talentNode.id, rank);
      if (talentNode.nodeType === "choice" && talentNode.choices[choiceIndex]) {
        choices.set(talentNode.id, talentNode.choices[choiceIndex].externalId);
      }
    }
    const heroSubtreeId = heroEntryIndex === null ? data.heroSubtreeId
      : data.heroSelections?.find(hero => hero.entryIndex === heroEntryIndex)?.subtreeId
        ?? (heroEntryIndex === data.heroSelectionEntryIndex ? data.heroSubtreeId : null);
    if (!heroSubtreeId || !reader.hasOnlyPadding()) return null;
    return { ranks, choices, heroSubtreeId };
  } catch {
    return null;
  }
}

/** A code for another hero path must never silently drop that path's talents. */
export function decodeWoWTalentLoadout(data: TalentCalculatorData, value: string) {
  const decoded = readWoWTalentLoadout(data, value);
  return decoded?.heroSubtreeId === data.heroSubtreeId ? decoded : null;
}

export function talentLoadoutHeroId(data: TalentCalculatorData, value: string) {
  return readWoWTalentLoadout(data, value)?.heroSubtreeId ?? null;
}

export function encodeWoWTalentLoadout(data: TalentCalculatorData, ranks: Map<string, number>, choices: Map<string, number>) {
  const writer = new BitWriter();
  writer.write(8, 2);
  writer.write(16, data.specId);
  const hash = data.treeHash?.match(/^[a-f\d]{32}$/i) ? data.treeHash.match(/../g)!.map(byte => parseInt(byte, 16)) : Array(16).fill(0);
  for (const byte of hash) writer.write(8, byte);
  const metadata = new Map(data.loadoutNodes.map((node) => [node.nodeId, node]));
  const visible = visibleNodes(data);
  for (const nodeId of data.fullNodeOrder) {
    const meta = metadata.get(nodeId);
    const node = visible.get(nodeId);
    const selector = nodeId === data.heroSelectionNodeId;
    const rank = selector ? 1 : node ? (ranks.get(node.id) ?? 0) : 0;
    const selected = selector || Boolean(meta?.freeNode) || rank > 0;
    writer.write(1, selected ? 1 : 0);
    if (!selected) continue;
    const purchased = !meta?.freeNode;
    writer.write(1, purchased ? 1 : 0);
    if (!purchased) continue;
    const maxRanks = Math.max(1, meta?.maxRanks ?? 1);
    const partial = rank !== maxRanks;
    writer.write(1, partial ? 1 : 0);
    if (partial) writer.write(6, Math.max(0, rank));
    const choiceNode = selector || meta?.nodeType === "choice" || meta?.nodeType === "subtree";
    writer.write(1, choiceNode ? 1 : 0);
    if (choiceNode) {
      const entryIds = meta?.choiceEntryIds ?? [];
      const selectedEntry = node ? choices.get(node.id) : undefined;
      const selectedIndex = selector ? data.heroSelectionEntryIndex : Math.max(0, entryIds.indexOf(selectedEntry ?? entryIds[0]));
      writer.write(2, selectedIndex);
    }
  }
  return writer.finish();
}

export function talentPointBudgets(data: TalentCalculatorData) {
  // Spendable points at level 90; source pointLevels excludes granted nodes.
  return data.pointBudgets ?? { class: 34, hero: 13, spec: 34 } satisfies Record<TalentKind, number>;
}
