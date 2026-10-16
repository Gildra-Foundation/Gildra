import { goldToCopper } from "./auctionMarket";

/** Accept the locale's displayed grouping, then send an exact decimal string to the API. */
export function normalizeAuctionBudgetGold(value: string, locale: "en" | "ru"): string {
  const input = value.trim();
  const pattern = locale === "en"
    ? /^(\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d{1,4}))?$/
    : /^(\d+|[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+)(?:[,.](\d{1,4}))?$/;
  const match = pattern.exec(input);
  if (!match) throw new Error("invalid_budget");
  const integer = match[1].replace(/[, \u00a0\u202f]/g, "");
  const canonical = integer + (match[2] ? `.${match[2]}` : "");
  goldToCopper(canonical);
  return canonical;
}
