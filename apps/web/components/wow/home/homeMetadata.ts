import { sectionMetadata } from "@/lib/routes/metadata";
import { wowHomeCopy } from "./wowHomeCopy";

export function homeMetadata(locale: "en" | "ru") {
  const base = sectionMetadata("wow", locale);
  const title = wowHomeCopy[locale].metaTitle;
  const description = wowHomeCopy[locale].description;
  return { ...base, title: { absolute: title }, description, robots: { index: true, follow: true }, openGraph: { ...base.openGraph, siteName: "WowArcana", title, description } };
}
