/** A bounded Voronoi sheet: neighbouring shards share the same jagged edge. */
export type IcePoint = [number, number];
export const ICE_FREEZE_MS = 820;
export const ICE_CRACK_MS = 420;
export const ICE_RELEASE_MS = 920;

export function iceRandom(seed = 73) {
  return () => {
    seed = Math.imul(1664525, seed) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
}

export function iceFracture(width: number, height: number) {
  const random = iceRandom();
  // A crushed pressure point surrounded by larger, uneven plates. Best-candidate
  // sampling avoids the visible rows/columns of a jittered rectangular grid.
  const pressure: IcePoint = [width * .63, height * .31];
  const seeds: IcePoint[] = [pressure];
  for (let i = 0; i < 4; i++) {
    const angle = (i + .2 + random() * .35) * Math.PI / 2;
    const reach = Math.min(width, height) * (.075 + random() * .045);
    seeds.push([pressure[0] + Math.cos(angle) * reach, pressure[1] + Math.sin(angle) * reach]);
  }
  while (seeds.length < 18) {
    let best: IcePoint = [0, 0], clearance = -1;
    for (let i = 0; i < 48; i++) {
      const candidate: IcePoint = [(.025 + random() * .95) * width, (.025 + random() * .95) * height];
      const nearest = Math.min(...seeds.map(([x, y]) => (x - candidate[0]) ** 2 + (y - candidate[1]) ** 2));
      if (nearest > clearance) { best = candidate; clearance = nearest; }
    }
    seeds.push(best);
  }
  const edges = new Map<string, { points: IcePoint[]; border: boolean }>();
  const cells = seeds.map(centre => {
    let polygon: IcePoint[] = [[0, 0], [width, 0], [width, height], [0, height]];
    for (const other of seeds) {
      if (other === centre) continue;
      const nx = other[0] - centre[0], ny = other[1] - centre[1];
      const limit = (other[0] ** 2 + other[1] ** 2 - centre[0] ** 2 - centre[1] ** 2) / 2;
      const clipped: IcePoint[] = [];
      polygon.forEach((a, index) => {
        const b = polygon[(index + 1) % polygon.length];
        const da = a[0] * nx + a[1] * ny - limit;
        const db = b[0] * nx + b[1] * ny - limit;
        if (da <= 0) clipped.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          clipped.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      });
      polygon = clipped;
    }
    const points: IcePoint[] = [];
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const a: IcePoint = [Number(start[0].toFixed(4)), Number(start[1].toFixed(4))];
      const b: IcePoint = [Number(end[0].toFixed(4)), Number(end[1].toFixed(4))];
      const reverse = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
      const first = reverse ? b : a, last = reverse ? a : b;
      const key = `${first.join(',')}:${last.join(',')}`;
      let edge = edges.get(key);
      if (!edge) {
        const border = (a[0] === b[0] && (a[0] === 0 || a[0] === width)) || (a[1] === b[1] && (a[1] === 0 || a[1] === height));
        const dx = last[0] - first[0], dy = last[1] - first[1];
        const bends: IcePoint[] = border ? [] : [.28, .63].map(t => {
          const kink = (random() - .5) * .09;
          return [Math.max(0, Math.min(width, first[0] + dx * t - dy * kink)), Math.max(0, Math.min(height, first[1] + dy * t + dx * kink))];
        });
        edge = { points: [first, ...bends, last], border };
        edges.set(key, edge);
      }
      const shared = reverse ? [...edge.points].reverse() : edge.points;
      points.push(...shared.slice(0, -1));
    });
    return { centre, points };
  });
  const diagonal = Math.hypot(width, height);
  const distance = ([x, y]: IcePoint) => Math.hypot(x - width * .63, y - height * .31);
  const cracks = [...edges.values()].filter(edge => !edge.border).map(({ points }) => ({
    points: distance(points[0]) < distance(points[points.length - 1]) ? points : [...points].reverse(),
    delay: Math.min(...points.map(distance)) / diagonal * 260,
  }));
  const hairlines = cracks.filter((_, index) => index % 2 === 0).map(({ points, delay }, index) => {
    const a = points[1], b = points[2], dx = b[0] - a[0], dy = b[1] - a[1];
    const side = index % 2 ? 1 : -1;
    const reach = Math.min(width, height) * (.018 + random() * .025);
    const angle = Math.atan2(dy, dx) + side * (.55 + random() * .45);
    const branch = (t: number, bend: number): IcePoint => [a[0] + Math.cos(angle + bend) * reach * t, a[1] + Math.sin(angle + bend) * reach * t];
    return {
      fine: true,
      delay: delay + 65,
      points: [a, branch(.38, -.08 * side), branch(.72, .1 * side), branch(1, .06 * side)]
        .map(([x, y]) => [Math.max(0, Math.min(width, x)), Math.max(0, Math.min(height, y))] as IcePoint),
    };
  });
  return { cells, cracks, hairlines };
}
