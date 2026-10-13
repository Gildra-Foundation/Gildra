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
