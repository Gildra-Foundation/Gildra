import { getImageProps } from "next/image";

/**
 * The full-screen painting of a hub that has no blurred stand-in (AtlasFrame
 * pages have one, see packages/atlas-ui placeholders). Without it a fresh
 * visit shows the bare page colour for a few hundred ms after the hand-over,
 * until the painting arrives. On link intent (hover, focus, tap) the runtime
 * preloads it next to the route's data, so the new page lands with its scene.
 *
 * Each entry mirrors the hub's own <picture>/<Image>: the preload picks the
 * same file the page will (media + srcset), so nothing is downloaded twice.
 */
type Preload = { href: string; media?: string; srcSet?: string; sizes?: string };

const picture = (path: string, tablet: string, mobile = 767): Preload[] => [
  { href: `${path}-mobile.webp`, media: `(max-width: ${mobile}px)` },
  { href: `${path}-${tablet}.webp`, media: `(min-width: ${mobile + 1}px) and (max-width: 1023px)` },
  { href: `${path}.webp`, media: "(min-width: 1024px)" },
];

function nextImage(src: string, sizes: string): Preload[] {
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  return [{ href: props.src, srcSet: props.srcSet, sizes: props.sizes }];
}

// Same file as CharacterAtlasBackdrop's CHARACTER_SCENE (not imported: it would pull the backdrop into the shell bundle).
const CHARACTER_SCENE = "/assets/wow/loading/characters-icecrown-20261106.webp";
const MYTHIC = () => picture("/assets/wow/mythic/hub/gateway", "768");
const routes: [RegExp, () => Preload[]][] = [
  [/^\/(?:wow\/mythic-plus|tier-lists)$/, MYTHIC],
  [/^\/wow\/raids$/, () => picture("/assets/wow/raids/hub/vault", "tablet")],
  [/^\/wow\/auction$/, () => [
    { href: "/assets/wow/auction/hall-orgrimmar-20261106-mobile.webp", media: "(max-width: 600px)" },
    { href: "/assets/wow/auction/hall-orgrimmar-20261106.webp", media: "(min-width: 601px) and (max-width: 900px)", srcSet: "/assets/wow/auction/hall-orgrimmar-20261106-768.webp 768w, /assets/wow/auction/hall-orgrimmar-20261106.webp 1672w", sizes: "100vw" },
    { href: "/assets/wow/auction/hall-orgrimmar-20261106.webp", media: "(min-width: 901px)" },
  ]],
  [/^\/talents(?:\/|$)/, () => [{ href: "/assets/wow/loading/talents-hall-20261106.webp", srcSet: "/assets/wow/loading/talents-hall-20261106-768.webp 768w, /assets/wow/loading/talents-hall-20261106.webp 1672w", sizes: "100vw" }]],
  [/^\/wow\/characters$/, () => nextImage(CHARACTER_SCENE, "(max-width: 767px) 100vw, 72vw")],
];

const warmed = new Set<string>();

/** Preloads the destination hub's painting once per document (no-op for other routes). */
export function warmRouteArt(pathname: string) {
  if (typeof document === "undefined") return;
  const path = pathname.replace(/^\/ru(?=\/|$)/, "").replace(/\/+$/, "") || "/";
  const entry = routes.find(([pattern]) => pattern.test(path));
  if (!entry || warmed.has(entry[0].source)) return;
  warmed.add(entry[0].source);
  for (const art of entry[1]()) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = art.href;
    if (art.media) link.media = art.media;
    if (art.srcSet) link.imageSrcset = art.srcSet;
    if (art.sizes) link.imageSizes = art.sizes;
    document.head.appendChild(link);
  }
}
