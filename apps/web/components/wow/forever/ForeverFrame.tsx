import type { AtlasSceneId } from "@/lib/atlas/scenes";
import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { FooterNavigation } from "@/components/atlas/FooterNavigation";
import { ForeverLanguageLinks } from "./ForeverLanguageLinks";

/** The site frame with the shared footer; its language links keep the open dungeon and floor. */
export function ForeverFrame({ lang, children, scene = "forever" }: { lang: Lang; children: ReactNode; scene?: AtlasSceneId }) {
  return <AtlasFrame lang={lang} scene={scene} footer={{ links: <FooterNavigation locale={lang} forever />, language: <ForeverLanguageLinks lang={lang} /> }}>{children}</AtlasFrame>;
}
