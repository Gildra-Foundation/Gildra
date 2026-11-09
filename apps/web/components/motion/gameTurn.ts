import type { WowPortalId } from "@/lib/games/wowPortals";

/**
 * A switch between game versions (the strip above the bar) marks the page
 * hand-over of its navigation: <html data-game-turn="<version>"> with the
 * direction of the move along the strip (--game-dir, 1 = to the right) and
 * where the chosen version sits (--game-x, 0-1 of the viewport). The View
 * Transition of that commit (RouteTransitionRuntime) then slides the new page
 * in from that side over a glow of the version's colour (app/styles/route-motion.css)
 * instead of the plain rise. The marks go with the hand-over (disarmRouteTurn)
 * or, when no hand-over plays (less motion, a weak device), after a while.
 */
const STALE_MS = 2500;
let stale: ReturnType<typeof setTimeout> | undefined;

export function armGameTurn(version: WowPortalId, direction: number, x: number) {
  const root = document.documentElement;
  root.dataset.gameTurn = version;
  root.style.setProperty("--game-dir", String(direction < 0 ? -1 : 1));
  root.style.setProperty("--game-x", `${Math.round(Math.min(1, Math.max(0, x)) * 100)}%`);
  clearTimeout(stale);
  stale = setTimeout(clearGameTurn, STALE_MS);
}

export function clearGameTurn() {
  const root = document.documentElement;
  clearTimeout(stale);
  if (!root.hasAttribute("data-game-turn")) return;
  delete root.dataset.gameTurn;
  root.style.removeProperty("--game-dir");
  root.style.removeProperty("--game-x");
}
