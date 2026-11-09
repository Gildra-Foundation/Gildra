/** Owner-supplied WowArcana logo. SVG stays sharp at every display density.
 * Decorative unless given a label; the historical component name keeps callers compatible. */
const ASPECT = 1003 / 975;

/** `eager`: above the fold (the top bar); it never outranks the page's own art. */
export function GildraCrest({ height, className, label, eager = false }: { height: number; className?: string; label?: string; eager?: boolean }) {
  const width = Math.round(height * ASPECT);
  return <picture className={className} data-gildra-crest>
    <img src="/brand/wowarcana-logo.svg" width={width} height={height}
      alt={label ?? ""} aria-hidden={label ? undefined : true} decoding="async" loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "auto" : "low"} draggable={false} />
  </picture>;
}
