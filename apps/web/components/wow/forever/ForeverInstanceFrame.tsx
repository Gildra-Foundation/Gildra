import type { ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import { FooterNavigation } from "@/components/atlas/FooterNavigation";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverLanguageLinks } from "./ForeverLanguageLinks";
import { instanceArt } from "./instanceArt";

/**
 * The Forever frame of one dungeon or raid page: the same footer as ForeverFrame, with the
 * instance's own painting behind the heading instead of the section scene.
 */
export function ForeverInstanceFrame({ lang, art, shade = "default", children }: { lang: Lang; art: string; shade?: "default" | "deep"; children: ReactNode }) {
  const painting = instanceArt(art);
  return <AtlasFrame lang={lang} scene="forever" art={painting?.src} artPosition={painting?.position} artShade={shade}
    dataAttributes={{ "data-forever-instance": art }}
    footer={{ links: <FooterNavigation locale={lang} forever />, language: <ForeverLanguageLinks lang={lang} /> }}>{children}</AtlasFrame>;
}
