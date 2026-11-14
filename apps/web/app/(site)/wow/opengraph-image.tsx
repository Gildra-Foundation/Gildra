// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { atlasOgImage } from "@/lib/og/atlasOg";
import { atlasScenes } from "@/lib/atlas/scenes";
import { wowHomeCopy } from "@/components/wow/home/wowHomeCopy";

export const alt = "WowArcana — World of Warcraft";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";
export default function Image() {
  const locale = "en";
  return atlasOgImage({ locale, art: atlasScenes.wow.art, focus: atlasScenes.wow.og, title: wowHomeCopy[locale].metaTitle, subtitle: wowHomeCopy[locale].description });
}
