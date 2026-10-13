import { bookArtworkSrc, phoneBookArtworkSrc } from "./bookArtwork";

export type BookNavigationDialogComponent = typeof import("./ToolbarBookNavigationDialog").BookNavigationDialog;

let artworkReady: Promise<unknown> | undefined;

export function loadBookNavigationDialog() {
  if (!artworkReady) {
    const artwork = window.matchMedia("(max-width: 820px)").matches ? phoneBookArtworkSrc : bookArtworkSrc;
    artworkReady = Promise.all([artwork, "/assets/wow/character-book/intro/chronicle-cover-v2-640.webp"].map((src) => {
      const image = new Image();
      image.src = src;
      return image.decode().catch(() => undefined);
    }));
  }
  return Promise.all([
    import("./ToolbarBookNavigationDialog"),
    Promise.race([artworkReady, new Promise<void>((resolve) => window.setTimeout(resolve, 400))]),
  ]).then(([module]) => module);
}
