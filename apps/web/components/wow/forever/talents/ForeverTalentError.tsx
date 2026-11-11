"use client";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { talentCopy } from "./talentCopy";

export function ForeverTalentError({ lang, reset }: { lang: "en" | "ru"; reset: () => void }) {
  const t = talentCopy[lang];
  return <div role="alert"><p>{t.failure}</p><AtlasButton onClick={reset}>{t.retry}</AtlasButton></div>;
}
