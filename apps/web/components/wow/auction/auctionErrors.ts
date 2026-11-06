import { auctionCopy } from "./auctionCopy";

/** What the player should do, never the technical code. */
export function auctionErrorMessage(code: string, lang: "ru" | "en") {
  const c = auctionCopy[lang];
  if (code === "not_configured") return c.notConfigured;
  if (code === "market_busy" || code === "rate_limited") return c.busy;
  if (code === "realm_required") return c.realmNeeded;
  if (code === "invalid_realm") return c.realmUnknown;
  if (code === "invalid_query") return c.invalid;
  return c.error;
}
