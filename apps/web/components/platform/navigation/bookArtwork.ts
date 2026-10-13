/** The open folio artwork behind the contents spread (also preloaded by the home page cover). */
export const bookArtworkSrc = "/assets/wow/character-book/folio-binding-v1.png";
/** The same folio through the image optimizer (WebP, ~0.2 MB) for phones. */
export const phoneBookArtworkSrc = `/_next/image?url=${encodeURIComponent(bookArtworkSrc)}&w=1920&q=75`;
