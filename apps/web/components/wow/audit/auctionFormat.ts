import type { Lang } from "@/lib/i18n-paths";

// Formatting is shared across slots, progress renders and both auction panels.
export const auctionFormats = Object.fromEntries((["ru", "en"] as const).map(locale => {
  const tag = locale === "ru" ? "ru-RU" : "en-US";
  return [locale, {
    numeric: new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }),
    signed: new Intl.NumberFormat(tag, { maximumFractionDigits: 2, signDisplay: "exceptZero" }),
    gold: new Intl.NumberFormat(tag, { maximumFractionDigits: 4 }),
    rate: new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }),
  }];
})) as Record<Lang, { numeric: Intl.NumberFormat; signed: Intl.NumberFormat; gold: Intl.NumberFormat; rate: Intl.NumberFormat }>;

const goldUnit: Record<Lang, string> = { ru: "зол.", en: "gold" };

/** An auction price (copper) in gold: "1 234,5 зол." / "1,234.5 gold". */
export function formatGold(copper: number, locale: Lang) {
  return `${auctionFormats[locale].gold.format(copper / 10000)} ${goldUnit[locale]}`;
}

/** A derived price (gold per +1 DPS) to two decimals; below a hundredth of gold it reads "<0.01 gold". Exact lot prices keep formatGold. */
export function formatGoldRate(copper: number, locale: Lang) {
  const gold = copper / 10000, { rate } = auctionFormats[locale];
  return gold < .01 ? `<${rate.format(.01)} ${goldUnit[locale]}` : `${rate.format(gold)} ${goldUnit[locale]}`;
}
