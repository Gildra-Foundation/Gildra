import { sectionMetadata } from "@/lib/routes/metadata";
import { wowHomeCopy } from "./wowHomeCopy";

export function homeMetadata(locale: "en" | "ru") {
  const base = sectionMetadata("wow", locale);
  const title = wowHomeCopy[locale].metaTitle;
  const description = wowHomeCopy[locale].lede;
  return { ...base, title, description, openGraph: { ...base.openGraph, title, description } };
}
