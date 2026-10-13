import { ViewTransition, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { artMorphName } from "@/lib/atlas/morph";
import { atlasScenes, type AtlasSceneId } from "@/lib/atlas/scenes";
import { GAMES } from "@/lib/games/registry";
import { t } from "@/lib/i18n";
import clsx from "clsx";
import { AtlasMotionToggle } from "./AtlasMotionToggle";
import { AtlasPointerLight } from "./AtlasPointerLight";
import styles from "./AtlasFrame.module.css";
import { artPlaceholder } from "@/lib/atlas/placeholders";

export type AtlasFrameProps = {
  children: ReactNode;
  /** Section scene from lib/atlas/scenes.ts (art, crop, shade, tint); explicit props below override it. */
  scene?: AtlasSceneId;
  /** Decorative artwork behind the top of the page; it fades into the solid body. */
  art?: string;
  /** Focal point of the artwork, CSS object-position (default "center 18%"). */
  artPosition?: string;
  /** "deep" darkens bright artwork (sunlit scenes, light portraits) so the hero text keeps its contrast. */
  artShade?: "default" | "deep";
  /** Illustration tint of the atmosphere glow; chrome stays amber. */
  tint?: string;
  /** No embers and no drifting artwork: work surfaces (calculators, editors) where motion distracts. */
  still?: boolean;
  /** Path of this page: a card that opens it with `morph` hands its picture over to this scene. */
  morphKey?: string;
  /** A living layer over the scene (e.g. a shader on a point of the painting); it settles and drifts with the art. */
  artLayer?: ReactNode;
  /** Rendered element (default <main>). Use "div" when the route already owns <main>. */
  as?: "main" | "div";
  className?: string;
  lang?: string;
  id?: string;
  /** Extra attributes for page-level hooks (data-*). */
  dataAttributes?: Record<`data-${string}`, string | boolean | undefined>;
  /** Slim legal line (Blizzard trademark notice + privacy link) under the content. */
  footer?: boolean;
};

/**
 * Page frame of every inner atlas route: atmosphere artwork, solid body and the
 * 1540 px content column. Pages compose AtlasHero / AtlasSection inside it.
 * The atmosphere is alive: the artwork settles in and drifts slowly, embers rise
 * through the torchlight. All of it is CSS and stops under reduced motion.
 */
export function AtlasFrame({ children, scene, art: artProp, artPosition: positionProp, artShade: shadeProp, tint: tintProp, still = false, artLayer, morphKey, as: Element = "main", className, lang, id, dataAttributes, footer = true }: AtlasFrameProps) {
  const preset: Partial<(typeof atlasScenes)[AtlasSceneId]> & { shade?: "deep"; tint?: string; ember?: string } = scene ? atlasScenes[scene] : {};
  const art = artProp ?? preset.art;
  const artPosition = positionProp ?? preset.position;
  const artShade = shadeProp ?? preset.shade ?? "default";
  const tint = tintProp ?? preset.tint;
  const locale = lang === "ru" ? "ru" : "en";
  const picture = art ? <Image className={styles.art} src={art} alt="" fill sizes="100vw" quality={50} loading="eager" fetchPriority="high" {...artPlaceholder(art)} /> : null;
  // Section sparks (scene `ember`): the spark and its halo in the section's colour.
  const vars: Record<string, string | undefined> = { "--atlas-frame-tint": tint, "--atlas-frame-art-position": artPosition };
  if (preset.ember) Object.assign(vars, { "--atlas-ember": preset.ember, "--atlas-ember-halo": `color-mix(in srgb, ${preset.ember} 24%, transparent)` });
  const style = vars as CSSProperties;
  const atmosphere = (
    <div className={styles.atmosphere} aria-hidden="true">
      {/* Decorative, but it is the largest paint of every route that has it: fetch it at high priority. */}
      {picture}
      {artLayer ? <div className={styles.artLayer}>{artLayer}</div> : null}
      {/* Torchlight over the artwork: a breathing glow and a few rising embers (CSS only). */}
      <span className={styles.embers} />
    </div>
  );
  return (
    // Page-to-page transition: the leaving page lets go, the next one rises out of
    // the dark (::view-transition rules in app/styles/view-transitions.css).
    <ViewTransition enter="atlas-page-in" exit="atlas-page-out" default="none">
      <Element className={clsx(styles.frame, artShade === "deep" && styles.deep, still && styles.still, className)} style={style} lang={lang} id={id} data-atlas-frame data-morph={morphKey ? "" : undefined} {...dataAttributes}>
        {/* With morphKey the whole atmosphere (art, shade, embers) is the shared element, so the
            card's picture lands on exactly what the page shows. */}
        {morphKey ? <ViewTransition name={artMorphName(morphKey)} share="atlas-art-morph">{atmosphere}</ViewTransition> : atmosphere}
        <AtlasPointerLight />
        <div className={styles.column}>
          {children}
          {footer ? (
            <footer className={styles.legal} data-text-links>
              <p>{t(locale)(GAMES.wow.legal)}</p>
              <div className={styles.legalLinks}>
                <AtlasMotionToggle locale={locale} />
                <Link href={locale === "ru" ? "/ru/wow/whats-new" : "/wow/whats-new"} prefetch={false}>{t(locale)("What's new")}</Link>
                <Link href={locale === "ru" ? "/ru/privacy" : "/privacy"} prefetch={false}>{t(locale)("Privacy Policy")}</Link>
              </div>
            </footer>
          ) : null}
        </div>
      </Element>
    </ViewTransition>
  );
}
