import snapshot from "@/lib/data/wow/mythicTalentImport";

// nodeID, maxRanks, type(single/choice/subtree/tiered), granted, heroSubtreeID,
// entries(spellID, maxRanks, heroSubtreeID). Entry order is the client's choice order.
export type ImportNode = [number, number, number, number, number, [number, number, number][]];
type ImportSpec = { classId: number; nodes: ImportNode[] };
type ImportSnapshot = { build: string; generatedAt: string; serializationVersion: number; classes: Record<string, { order: number[]; hash: string }>; specs: Record<string, ImportSpec> };
// The generated tuple contract is checked by the snapshot generator and tests.
export const talentImportSnapshot = snapshot as unknown as ImportSnapshot;
export const maxTalentStringLength = 4096;
export type TalentImportError = "invalid" | "version" | "spec" | "tree";
export type ImportedTalents = { ok: true; code: string; classId: number; specId: number; selectedSpellIds: number[]; hashChecked: boolean };
export type TalentImportResult = ImportedTalents | { ok: false; error: TalentImportError };
export type TalentSpellSelection = ReadonlySet<number> | undefined;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

class ImportBits {
  offset = 0;
  readonly value: string;
  constructor(value: string) { this.value = value; }
  read(width: number) {
    if (this.offset + width > this.value.length * 6) throw new Error("Truncated talent export");
    let result = 0;
    for (let bit = 0; bit < width; bit++, this.offset++) result |= ((alphabet.indexOf(this.value[Math.floor(this.offset / 6)]) >> (this.offset % 6)) & 1) << bit;
    return result;
  }
  finish() {
    const canonicalLength = Math.ceil(this.offset / 6);
    const remaining = this.value.length * 6 - this.offset;
    // The live SimC Hunter profiles add one zero sextet; the client ignores it.
    // Permit only that bounded zero padding, never unknown nonzero payload.
    if (remaining >= 12 || (remaining > 0 && this.read(remaining) !== 0)) throw new Error("Trailing talent data");
    return canonicalLength;
  }
}

function spellsAtRank(node: ImportNode, rank: number, choice: number) {
  if (node[2] !== 3) return node[5][choice]?.[0] ? [node[5][choice][0]] : [];
  const spells: number[] = [];
  for (const [spell, max] of node[5]) {
    if (rank <= 0) break;
    if (spell) spells.push(spell);
    rank -= max;
  }
  return spells;
}

/** Decode the Blizzard bitstream against the current complete class order, never guessed spell positions. */
export function decodeMythicTalentImport(raw: string): TalentImportResult {
  try {
    if (!raw || raw.length > maxTalentStringLength) return { ok: false, error: "invalid" };
    const code = raw.replace(/\s+/g, "").replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]+$/.test(code)) return { ok: false, error: "invalid" };
    const reader = new ImportBits(code);
    if (reader.read(8) !== talentImportSnapshot.serializationVersion) return { ok: false, error: "version" };
    const specId = reader.read(16);
    const spec = talentImportSnapshot.specs[specId];
    if (!spec) return { ok: false, error: "spec" };
    const tree = talentImportSnapshot.classes[spec.classId];
    const hash = Array.from({ length: 16 }, () => reader.read(8));
    const hashChecked = hash.some(byte => byte !== 0);
    if (hashChecked && hash.map(byte => byte.toString(16).padStart(2, "0")).join("") !== tree.hash.toLowerCase()) return { ok: false, error: "tree" };
    const nodes = new Map(spec.nodes.map(node => [node[0], node]));
    const selected: { node: ImportNode; rank: number; choice: number }[] = [];
    let hero = 0;
    for (const id of tree.order) {
      if (!reader.read(1)) continue;
      const node = nodes.get(id);
      if (!node || !node[5].length) throw new Error("Foreign or unknown selected node");
      const purchased = reader.read(1) === 1;
      let rank = 1, choice = 0;
      if (purchased) {
        const partial = reader.read(1) === 1;
        rank = partial ? reader.read(6) : node[1];
        if (rank < 1 || rank > node[1] || (partial && rank === node[1])) throw new Error("Invalid purchased rank");
        const isChoice = reader.read(1) === 1;
        if (isChoice !== (node[2] === 1 || node[2] === 2)) throw new Error("Changed choice topology");
        if (isChoice) choice = reader.read(2);
      } else if (node[2] === 1 || node[2] === 2) throw new Error("Ambiguous granted choice");
      if (!node[5][choice]) throw new Error("Invalid choice entry");
      if (node[2] === 2) {
        if (hero) throw new Error("Multiple hero selections");
        hero = node[5][choice][2];
        if (!hero) throw new Error("Unknown hero path");
      }
      selected.push({ node, rank, choice });
    }
    const canonicalLength = reader.finish();
    const spells = new Set<number>();
    // Exports can retain purchased ranks in an inactive hero subtree.
    for (const { node, rank, choice } of selected) {
      if (node[4] && node[4] !== hero) continue;
      for (const spell of spellsAtRank(node, rank, choice)) spells.add(spell);
    }
    // Automatically granted class/spec abilities remain available at Mythic+ level.
    for (const node of spec.nodes) if (node[3] && node[2] !== 2 && (!node[4] || node[4] === hero)) for (const spell of spellsAtRank(node, 1, 0)) spells.add(spell);
    return { ok: true, code: code.slice(0, canonicalLength), classId: spec.classId, specId, selectedSpellIds: [...spells].sort((a, b) => a - b), hashChecked };
  } catch { return { ok: false, error: "invalid" }; }
}
