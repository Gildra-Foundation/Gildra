/**
 * Blurred stand-ins of paintings while they load (roadmap item 64). The app
 * hands the kit its generated map once (`configureArtPlaceholders`, done by
 * components/atlas); AtlasFrameShell, AtlasCard and AtlasPath spread
 * `artPlaceholder(src)` into next/image. Unknown pictures get none.
 */
let placeholders: Record<string, string> = {};

export function configureArtPlaceholders(map: Record<string, string>) {
  placeholders = map;
}

export function artPlaceholder(src: string | undefined): { placeholder?: "blur"; blurDataURL?: string } {
  const data = src ? placeholders[src] : undefined;
  return data ? { placeholder: "blur", blurDataURL: data } : {};
}

/**
 * Phone crops of the frame's scene paintings (art direction): `npm run art:portraits`
 * cuts a full-height strip around the scene's focus, `cw = 0.9 · height` wide, at
 * the painting's own resolution. The frame's atmosphere is a full-width box up to
 * 880 px tall, so on a portrait screen `object-fit: cover` shows only that strip of
 * the landscape painting; the crop shows the same pixels from a file half the size,
 * which the phone loads at its real display size instead of a magnified 100vw one.
 */
export type ArtPortrait = { src: string; x: number; width: number; height: number };
let portraits: Record<string, ArtPortrait> = {};

/** Screens whose atmosphere box is at most 0.9 as wide as tall: max-width 0.9 · 880 px, or below 1:1 on short screens (box 110vh). */
export const ART_PORTRAIT_MEDIA = "(max-width: 792px) and (max-aspect-ratio: 99/100)";
/** The crop's rendered width in the 880 px box (0.9 · 880). */
export const ART_PORTRAIT_SIZES = "792px";

export function configureArtPortraits(map: Record<string, ArtPortrait>) {
  portraits = map;
}

/** The phone crop of a painting at this object-position, if one was cut for that focus. */
export function artPortrait(src: string | undefined, position: string | undefined): ArtPortrait | undefined {
  const portrait = src ? portraits[src] : undefined;
  if (!portrait) return undefined;
  const x = (position ?? "center").trim().split(/\s+/)[0];
  const focus = x === "center" ? 0.5 : x === "left" ? 0 : x === "right" ? 1 : parseFloat(x) / 100;
  return Math.abs(focus - portrait.x) < 0.005 ? portrait : undefined;
}
