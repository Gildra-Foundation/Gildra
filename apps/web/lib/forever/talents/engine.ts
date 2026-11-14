import type { BuildError, TalentBuild, TalentClass, TalentNode, TalentTree } from "./types";

export const emptyBuild = (): TalentBuild => ({ level: 60, talented: 0, ranks: {} });
export const spentPoints = (ranks: TalentBuild["ranks"]): number => Object.values(ranks).reduce((sum, rank) => sum + rank, 0);
export const pointBudget = (level: number, talented = 0): number => Math.max(0, Math.min(51, level - 9 + talented));
export const treePoints = (tree: TalentTree, ranks: TalentBuild["ranks"]): number => tree.nodes.reduce((sum, node) => sum + (ranks[node.id] ?? 0), 0);
export const requiredLevel = (cls: TalentClass, build: TalentBuild): number => {
  const spent = spentPoints(build.ranks);
  if (!spent) return 1;
  return Math.max(spent + 9 - build.talented,
    ...cls.trees.flatMap(tree => tree.nodes.filter(node => (build.ranks[node.id] ?? 0) > 0).map(node => node.level - build.talented)));
};

/** Native Forever gates: an explicit node list overrides the row boundary. */
export function gatePoints(tree: TalentTree, node: TalentNode, ranks: TalentBuild["ranks"]): number {
  return tree.nodes.reduce((sum, candidate) => sum + (
    (node.gate.nodeIds ? node.gate.nodeIds.includes(candidate.id) : candidate.row <= node.gate.throughRow)
      ? (ranks[candidate.id] ?? 0) : 0), 0);
}

export function requirementsMet(tree: TalentTree, node: TalentNode, ranks: TalentBuild["ranks"]): boolean {
  const required = node.prerequisites.filter(pre => pre.required);
  const alternatives = node.prerequisites.filter(pre => !pre.required);
  const met = (pre: TalentNode["prerequisites"][number]) => (ranks[pre.nodeId] ?? 0) >= pre.ranks;
  return gatePoints(tree, node, ranks) >= node.gate.points && required.every(met)
    && (!alternatives.length || alternatives.some(met));
}

/**
 * Reconstruct a legal spending order. A final-state gate check alone accepts
 * self-supporting allocations when a native gate includes its own row.
 * All conditions are monotone, so greedy replay is complete, not heuristic.
 */
export function validateBuild(cls: TalentClass, build: TalentBuild): BuildError | null {
  if (!Number.isInteger(build.level) || build.level < 1 || build.level > 60) return "level";
  if (!Number.isInteger(build.talented) || build.talented < 0 || build.talented > 5) return "talented";
  const entries = cls.trees.flatMap(tree => tree.nodes.map(node => ({ tree, node })));
  const nodes = new Map(entries.map(({ node }) => [node.id, node]));
  for (const [key, rank] of Object.entries(build.ranks)) {
    const node = nodes.get(Number(key));
    if (!node || String(node.id) !== key) return "unknown-node";
    if (!Number.isInteger(rank) || rank < 0 || rank > node.maxRanks) return "rank";
  }
  const total = spentPoints(build.ranks);
  if (total > Math.min(cls.maxPoints, pointBudget(build.level, build.talented))) return "budget";
  const replay: TalentBuild["ranks"] = {};
  let remaining = total;
  while (remaining > 0) {
    const before = remaining;
    for (const { tree, node } of entries) {
      if ((replay[node.id] ?? 0) < (build.ranks[node.id] ?? 0)
        && build.level + build.talented >= node.level && requirementsMet(tree, node, replay)) {
        replay[node.id] = (replay[node.id] ?? 0) + 1;
        remaining--;
      }
    }
    if (remaining === before) return "requirements";
  }
  return null;
}

export function changeRank(cls: TalentClass, build: TalentBuild, nodeId: number, delta: 1 | -1): TalentBuild | null {
  const ranks = { ...build.ranks, [nodeId]: (build.ranks[nodeId] ?? 0) + delta };
  if (ranks[nodeId] === 0) delete ranks[nodeId];
  const next = { ...build, ranks };
  return validateBuild(cls, next) ? null : next;
}

/** Site-owned format; deliberately not advertised as a game or Wowhead import. */
export function encodeBuild(cls: TalentClass, snapshot: string, build: TalentBuild): string {
  if (validateBuild(cls, build)) throw new Error("Cannot share an invalid Forever build");
  const digits = cls.trees.flatMap(tree => tree.nodes.map(node => build.ranks[node.id] ?? 0)).join("");
  return `1.${snapshot}.${cls.slug}.${build.level}.${build.talented}.${digits}`;
}

export function decodeBuild(cls: TalentClass, snapshot: string, token: string | null | undefined): { build: TalentBuild; error: BuildError | null } {
  const fail = (error: BuildError) => ({ build: emptyBuild(), error });
  if (!token) return { build: emptyBuild(), error: null };
  if (token.length > 256) return fail("format");
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "1" || !/^\d{1,2}$/.test(parts[3]) || !/^\d$/.test(parts[4])) return fail("format");
  if (parts[1] !== snapshot) return fail("snapshot");
  if (parts[2] !== cls.slug) return fail("class");
  const nodes = cls.trees.flatMap(tree => tree.nodes);
  if (parts[5].length !== nodes.length || !/^\d+$/.test(parts[5])) return fail("format");
  const build: TalentBuild = { level: Number(parts[3]), talented: Number(parts[4]), ranks: {} };
  nodes.forEach((node, index) => { if (parts[5][index] !== "0") build.ranks[node.id] = Number(parts[5][index]); });
  const error = validateBuild(cls, build);
  return error ? fail(error) : { build, error: null };
}
