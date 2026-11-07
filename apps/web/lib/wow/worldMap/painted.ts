import type { MapArt, Rect } from "@/lib/wow/worldMap/types";

/**
 * The painted words and decor of a picture, as the data gives them (0..1 of
 * the picture): a box, optionally naming the map it labels (`labelFor`).
 * Accepts plain boxes ([x0, y0, x1, y1]) and objects ({ box | rect, labelFor }).
 */
export type ArtBox = { box: Rect; for?: number };
type Raw = Rect | { box?: Rect; rect?: Rect; labelFor?: number | string | null; for?: number | string | null };

const isRect = (value: unknown): value is Rect =>
  Array.isArray(value) && value.length === 4 && value.every(Number.isFinite) && value[2] > value[0] && value[3] > value[1];

function boxes(list: unknown): ArtBox[] {
  if (!Array.isArray(list)) return [];
  const out: ArtBox[] = [];
  for (const item of list as Raw[]) {
    if (isRect(item)) { out.push({ box: item }); continue; }
    if (!item || typeof item !== "object") continue;
    const box = isRect(item.box) ? item.box : isRect(item.rect) ? item.rect : null;
    if (!box) continue;
    const target = item.labelFor ?? item.for;
    const id = typeof target === "number" ? target : typeof target === "string" && /^\d+$/.test(target) ? Number(target) : undefined;
    out.push(id === undefined ? { box } : { box, for: id });
  }
  return out;
}

export const labelBoxes = (art: Pick<MapArt, "paintedLabels"> & { paintedLabels?: unknown }) => boxes(art.paintedLabels);
/** Frames, crests and corner pieces painted into the picture (`decor`). */
export const decorBoxes = (art: object) => boxes((art as { decor?: unknown }).decor);
