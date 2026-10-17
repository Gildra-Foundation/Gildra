import { goldToCopper } from "./auctionMarket";

/** Accept locale grouping and canonicalize equal amounts without floating-point rounding. */
export function normalizeAuctionBudgetGold(value: string, locale: "en" | "ru"): string {
  const input = value.trim();
  const pattern = locale === "en"
    ? /^(\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.(\d{1,4}))?$/
    : /^(\d+|[1-9]\d{0,2}(?:[ \u00a0\u202f]\d{3})+)(?:[,.](\d{1,4}))?$/;
  const match = pattern.exec(input);
  if (!match) throw new Error("invalid_budget");
  const integer = match[1].replace(/[, \u00a0\u202f]/g, "");
  const decimal = integer + (match[2] ? `.${match[2]}` : "");
  // Validate before removing zeros so accepted precision and digit limits stay unchanged.
  goldToCopper(decimal);
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return integer.replace(/^0+(?=\d)/, "") + (fraction ? `.${fraction}` : "");
}
