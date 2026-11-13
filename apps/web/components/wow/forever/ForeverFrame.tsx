import type { AtlasSceneId } from "@/lib/atlas/scenes";
import type { ComponentProps, ReactNode } from "react";
import { AtlasFrame } from "@/components/atlas";
import type { Lang } from "@/lib/i18n-paths";
import { FooterNavigation } from "@/components/atlas/FooterNavigation";
import { ForeverLanguageLinks } from "./ForeverLanguageLinks";
import { ForeverMotion } from "./shared/ForeverMotion";
import { foreverScenes, type ForeverPageId } from "./shared/foreverScenes";
import styles from "./shared/forever.module.css";

type Props = {
  lang: Lang;
  children: ReactNode;
  /** The page of the section: it picks the scene behind the hero (shared/foreverScenes.ts). */
  page?: ForeverPageId;
  /** A scene by name, when the page is not one of the section's own. */
  scene?: AtlasSceneId;
  /** The painting of one entity (a dungeon, a raid) instead of a scene. */
  art?: string;
  artPosition?: string;
  /** How far that painting is dimmed behind the hero (default "deep": a game painting is brighter than the site's scenes). */
  artShade?: ComponentProps<typeof AtlasFrame>["artShade"];
  className?: string;
};

/** The site frame of every Forever page: its scene, the section's motion and the shared footer; the footer language links keep the open dungeon and floor. */
export function ForeverFrame({ lang, children, page = "hub", scene, art, artPosition, artShade = "deep", className }: Props) {
  return <AtlasFrame lang={lang} scene={scene ?? foreverScenes[page]} art={art} artPosition={artPosition} artShade={art ? artShade : undefined}
    className={className ? `${styles.page} ${className}` : styles.page} dataAttributes={{ "data-forever": page }}
    footer={{ links: <FooterNavigation locale={lang} forever />, language: <ForeverLanguageLinks lang={lang} /> }}>
    <ForeverMotion />
    {children}
  </AtlasFrame>;
}
