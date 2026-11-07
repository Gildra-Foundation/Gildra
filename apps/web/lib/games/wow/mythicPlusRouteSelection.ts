/** Rank only runs from the same dungeon; composition breaks distance ties. */
export type RouteCandidate = { id: number; level: number; clearMs: number; specs?: number[] };
export function rankSimilarRuns<T extends RouteCandidate>(run: RouteCandidate, candidates: T[]): T[] {
  const overlap = (specs: number[] = []) => { const left = [...specs]; return (run.specs ?? []).reduce((n, spec) => { const i = left.indexOf(spec); if (i < 0) return n; left.splice(i, 1); return n + 1; }, 0); };
  return candidates.filter(r => r.id !== run.id).sort((a,b) => Math.abs(a.level-run.level)-Math.abs(b.level-run.level) || Math.abs(a.clearMs-run.clearMs)-Math.abs(b.clearMs-run.clearMs) || overlap(b.specs)-overlap(a.specs) || a.id-b.id);
}
export function stepPull(numbers: number[], current: number, delta: number): number {
  if (!numbers.length) return current;
  return numbers[Math.max(0, Math.min(numbers.length-1, Math.max(0, numbers.indexOf(current))+delta))];
}
