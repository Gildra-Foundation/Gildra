import bridge from "./valyroAtlasBridge.module.css";

/**
 * The document root carries every theme token once: the Valyro theme (data-theme/data-mode),
 * the atlas tokens (`:root` in apps/web/app/styles/atlas-theme.css) and, through the class, the
 * Valyro → atlas bridge. Elements below inherit them instead of re-declaring the set: an element
 * that declares any custom property copies every token declared below the root, so tokens on a
 * wrapper made every such element pay for the whole set. Not a client module: server layouts
 * read these values. Pair with `<AtlasValyroScope root>`.
 */
export const atlasRootAttributes = { "data-theme": "vercel", "data-mode": "dark" } as const;
/**
 * The bridge class: on the document root (join with its other classes) and on any element that
 * re-themes the atlas base tokens for a subtree (the bridge reads them where it is declared).
 */
export const atlasBridgeClassName: string = bridge.scope;
