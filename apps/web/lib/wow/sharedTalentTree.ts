import type { TalentCalculatorData, TalentKind, TalentNode } from "@/lib/talentCalculatorData";
import { decodeMythicTalentTree, talentImportSnapshot, type ImportedTalentNode } from "@/components/wow/mythic/mythicTalentImport";

export type SharedTalentTreeData = Pick<TalentCalculatorData, "specId" | "heroSubtreeId" | "heroName" | "fullNodeOrder" | "trees" | "source" | "buildVersion">;
export type ViewedTalentNode = { node: TalentNode; selection?: ImportedTalentNode };
export type ViewedTalentTrees = Record<TalentKind, ViewedTalentNode[]>;

/** Never project a build onto a different topology or silently omit a selected node. */
export function projectSharedTalentTree(data: SharedTalentTreeData, code: string): ViewedTalentTrees {
  const decoded = decodeMythicTalentTree(code);
  if (!decoded.ok || data.specId !== decoded.specId || (decoded.heroSubtreeId && data.heroSubtreeId !== decoded.heroSubtreeId)) throw new Error("Talent tree mismatch");
  const expected = talentImportSnapshot.classes[decoded.classId].order;
  if (expected.length !== data.fullNodeOrder.length || expected.some((id, index) => id !== data.fullNodeOrder[index])) throw new Error("Talent order changed");
  const metadata = new Map(talentImportSnapshot.specs[decoded.specId].nodes.map(node => [node[0], node]));
  const selected = new Map(decoded.nodes.map(node => [node.nodeId, node]));
  const visible = new Set<number>();
  const trees = Object.fromEntries((["class", "spec", "hero"] as const).map(kind => [kind, data.trees[kind].nodes.flatMap(node => {
    const meta = metadata.get(node.nodeId);
    // The catalog keeps a few unselected empty layout placeholders (no spell).
    if (meta && !node.choices.length && meta[5].every(entry => !entry[0]) && !selected.has(node.nodeId)) return [];
    const entries = meta?.[2] === 0 ? meta[5].slice(0, meta[5].findLastIndex(entry => entry[0] !== 0) + 1) : meta?.[5];
    if (!meta || !entries || node.maxRanks !== meta[1] || !Number.isFinite(node.x) || !Number.isFinite(node.y) || node.choices.length !== entries.length || node.choices.some((choice, index) => (choice.spellId ?? 0) !== entries[index][0])) throw new Error("Talent definitions changed");
    if (meta[4] && meta[4] !== data.heroSubtreeId) throw new Error("Inactive hero tree");
    visible.add(node.nodeId);
    return [{ node, selection: selected.get(node.nodeId) }];
  })])) as ViewedTalentTrees;
  if (decoded.nodes.some(node => !visible.has(node.nodeId))) throw new Error("Selected talent missing");
  if (!decoded.heroSubtreeId) trees.hero = [];
  return trees;
}
