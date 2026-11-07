/** The same shape as the engine's insets (px of the stage the panels cover). */
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Phones and narrow windows: panels stack over and under the map instead of beside it. */
export const NARROW_QUERY = "(max-width: 700px)";

/**
 * The part of the stage the map may use: beside the title column and the
 * tools on wide screens, under the title and above the dock (timeline, card,
 * cookie notice) everywhere. The engine fits maps into what stays free.
 */
export function measureInsets(stage: HTMLElement | null, side: HTMLElement | null, dock: HTMLElement | null, tools: HTMLElement | null): Insets {
  const s = stage?.getBoundingClientRect();
  if (!s) return { top: 0, right: 0, bottom: 120, left: 0 };
  // Phones: the place sheet floats over the map's lower edge; the timeline bar is what the map must clear.
  const narrow = s.width <= 700;
  const d = ((narrow ? dock?.lastElementChild as HTMLElement | null : null) ?? dock)?.getBoundingClientRect();
  const bottom = d && d.height > 0 ? Math.max(0, s.bottom - d.top) + 8 : 24;
  const t = side?.getBoundingClientRect();
  if (narrow) return { top: t ? Math.max(0, Math.round(t.bottom - s.top) + 8) : 0, right: 0, bottom, left: 0 };
  const c = ((tools?.firstElementChild as HTMLElement | null) ?? tools)?.getBoundingClientRect();
  return {
    top: 0,
    right: c ? Math.max(0, Math.round(s.right - c.left) + 8) : 0,
    bottom,
    left: t ? Math.max(0, Math.round(t.right - s.left) + 12) : 0,
  };
}
