/**
 * The address to share: the canonical URL without a scroll anchor (#section), but with a hash
 * that holds the page's state (#boss=vorasius&difficulty=heroic on a raid guide) — the link
 * must open the boss the reader is looking at, not the first one.
 */
export function shareUrl(at: Pick<Location, "origin" | "pathname" | "search" | "hash">) {
  return `${at.origin}${at.pathname}${at.search}${at.hash.includes("=") ? at.hash : ""}`;
}
