/**
 * The Gildra crest: the gilded helmet of the brand (public/brand/helmet.png, also
 * the favicon and the JSON-LD logo). Pre-sized AVIF/WebP cuts sit next to it
 * (gildra-helmet-<height>.{avif,webp}); the crest picks 1×/2×/3× by its height,
 * so no image optimizer round trip is needed. Decorative unless given a label.
 */
const CUTS = [56, 112, 168, 256] as const;
/** Natural aspect of the helmet artwork (396 × 512). */
const ASPECT = 396 / 512;

function srcSet(height: number, format: "avif" | "webp") {
  const pick = (scale: number) => CUTS.find(cut => cut >= height * scale) ?? CUTS[CUTS.length - 1];
  const seen = new Set<number>();
  return [1, 2, 3].flatMap(scale => {
    const cut = pick(scale);
    if (seen.has(cut)) return [];
    seen.add(cut);
    return [`/brand/gildra-helmet-${cut}.${format} ${scale}x`];
  }).join(", ");
}

/** `eager`: above the fold (the top bar); it never outranks the page's own art. */
export function GildraCrest({ height, className, label, eager = false }: { height: number; className?: string; label?: string; eager?: boolean }) {
  const width = Math.round(height * ASPECT);
  return <picture className={className} data-gildra-crest>
    <source type="image/avif" srcSet={srcSet(height, "avif")} />
    <source type="image/webp" srcSet={srcSet(height, "webp")} />
    <img src={`/brand/gildra-helmet-${CUTS.find(cut => cut >= height * 2) ?? 256}.webp`} width={width} height={height}
      alt={label ?? ""} aria-hidden={label ? undefined : true} decoding="async" loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "auto" : "low"} draggable={false} />
  </picture>;
}
