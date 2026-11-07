import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";

/** Forever pages: the World of Warcraft scene and the site footer. */
export function ForeverFrame({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <AtlasFrame lang={lang} scene="wow">{children}</AtlasFrame>;
}
