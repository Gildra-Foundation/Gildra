import type { TalentCalculatorData, TalentKind } from "@/lib/talentCalculatorData";

export const FURY_REFERENCE_LOADOUT = "CgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgGDzMmZ2MzMzMDjZmZGzMzsMzMmZmZzYmBAAixy2ALgJYGmAzwGwMDjNAAYmhxYYMYM";
export const TALENT_HANDOFF_STORAGE_KEY = "gildra:talent-calculator:rotation-handoff:v1";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

class BitReader {
  private offset = 0;
  private readonly value: string;
  constructor(value: string) { this.value = value; }
  read(width: number) {
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

export function decodeWoWTalentLoadout(data: TalentCalculatorData, value: string) {
  try {
    if (!value || !/^[A-Za-z0-9+/=_-]+$/.test(value)) return null;
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const reader = new BitReader(normalized);
    if (reader.read(8) !== 2 || reader.read(16) !== data.specId) return null;
    for (let index = 0; index < 16; index += 1) reader.read(8);
    const metadata = new Map(data.loadoutNodes.map((node) => [node.nodeId, node]));
    const visible = visibleNodes(data);
    const ranks = new Map<string, number>();
    const choices = new Map<string, number>();
    for (const nodeId of data.fullNodeOrder) {
      const node = metadata.get(nodeId);
      const selected = reader.read(1) === 1;
      if (!selected) continue;
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
      const talentNode = visible.get(nodeId);
      if (!talentNode || nodeId === data.heroSelectionNodeId) continue;
      ranks.set(talentNode.id, Math.min(talentNode.maxRanks, Math.max(1, rank)));
      if (talentNode.nodeType === "choice" && talentNode.choices[choiceIndex]) {
        choices.set(talentNode.id, talentNode.choices[choiceIndex].externalId);
      }
    }
    return { ranks, choices };
  } catch {
    return null;
  }
}

export function encodeWoWTalentLoadout(data: TalentCalculatorData, ranks: Map<string, number>, choices: Map<string, number>) {
  const writer = new BitWriter();
  writer.write(8, 2);
  writer.write(16, data.specId);
  for (let index = 0; index < 16; index += 1) writer.write(8, 0);
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
  const decoded = decodeWoWTalentLoadout(data, FURY_REFERENCE_LOADOUT);
  const result: Record<TalentKind, number> = { class: 34, hero: 13, spec: 34 };
  if (!decoded) return result;
  for (const kind of Object.keys(result) as TalentKind[]) {
    const freeNodes = new Set(data.trees[kind].nodes.filter((node) => node.freeNode).map((node) => node.id));
    result[kind] = [...decoded.ranks.entries()]
      .filter(([id]) => id.startsWith(`${kind}-`) && !freeNodes.has(id))
      .reduce((sum, [, rank]) => sum + rank, 0);
  }
  return result;
}
