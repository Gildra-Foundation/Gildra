import { auctionGearCoverageCopy } from "./auctionGearCoverageCopy";
/** Localized reasons why verified recommendations do not cover the whole market. */
type CoverageCounts = Partial<Record<"unsupportedModifierLots" | "variantsRejected" | "referenceItemsRejected" | "catalogItemsMissing" | "catalogUnmatchedItemIds" | "eligibilityUnverifiedItems", number>>;
export function auctionGearCoverageReasons(coverage: CoverageCounts, dataComplete: boolean | undefined, locale: "en" | "ru") {
  const number = new Intl.NumberFormat({ ru: "ru-RU", en: "en-US" }[locale]);
  const reasons = (Object.keys(auctionGearCoverageCopy.en.reasons) as Array<keyof typeof auctionGearCoverageCopy.en.reasons>).flatMap(key => {
    const count = coverage[key];
    return typeof count === "number" && Number.isFinite(count) && count > 0
      ? [{ key: key as string, text: `${number.format(count)} — ${auctionGearCoverageCopy[locale].reasons[key]}` }] : [];
  });
  if (!reasons.length && dataComplete === false) reasons.push({ key: "dataIncomplete", text: auctionGearCoverageCopy[locale].dataIncomplete });
  return reasons;
}
