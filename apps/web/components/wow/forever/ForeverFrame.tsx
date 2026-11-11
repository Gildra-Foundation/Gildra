import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverLanguageLinks } from "./ForeverLanguageLinks";

/** The site frame with the shared footer; its language links keep the open dungeon and floor. */
export function ForeverFrame({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <AtlasFrame lang={lang} scene="wow" footer={{ language: <ForeverLanguageLinks lang={lang} /> }}>{children}</AtlasFrame>;
}
