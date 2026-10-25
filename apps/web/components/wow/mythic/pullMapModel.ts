import type { MdtDataset, MdtNode } from "@/lib/data/wow/mythicReview.types";

/** A broken author import must not turn spawn groups into an invented route. */
export function pullMapModel(data: MdtDataset) {
  const authored = data.route.status === "dataset-matched" && data.route.pulls.length > 0;
  const byId = new Map(data.nodes.map(node => [node.id, node]));
  const groups = new Map<string, MdtNode[]>();
  if (!authored) for (const node of data.nodes) {
    const key = `${node.floor}:${node.group}`;
    groups.set(key, [...(groups.get(key) ?? []), node]);
  }
  const pulls = (authored ? data.route.pulls.map(ids => ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : [])) : [...groups.values()]).filter(members => members.length);
  const floors = [...new Set(data.nodes.map(node => node.floor))].sort((a, b) => a - b);
  return { authored, pulls, floors };
}

export function pullPosition(members: MdtNode[], floor: number) {
  const local = members.filter(node => node.floor === floor);
  return local.length ? {
    x: local.reduce((sum, node) => sum + node.x, 0) / local.length,
    y: local.reduce((sum, node) => sum + node.y, 0) / local.length,
    count: local.length,
    boss: local.every(node => node.boss),
  } : null;
}
