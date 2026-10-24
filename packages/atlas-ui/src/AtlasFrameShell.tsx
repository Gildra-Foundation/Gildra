import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import clsx from "clsx";
import { AtlasArtGlow, type ArtGlowPoint } from "./AtlasArtGlow";
import { AtlasMotionToggle } from "./AtlasMotionToggle";
import { morphSceneProps } from "./morph";
import { artPlaceholder } from "./placeholders";
import styles from "./AtlasFrame.module.css";

export type AtlasGlow = { size: readonly [number, number]; points: readonly ArtGlowPoint[] };

export type AtlasFrameShellProps = {
  children: ReactNode;
  /** Decorative artwork behind the top of the page; it fades into the solid body. */
  art?: string;
  /** Focal point of the artwork, CSS object-position (default "center 18%"). */
  artPosition?: string;
  /** "deep" darkens bright artwork (sunlit scenes, light portraits) so the hero text keeps its contrast. */
  artShade?: "default" | "deep";
  /** Illustration tint of the atmosphere glow; chrome stays amber. */
  tint?: string;
  /** Colour of the rising sparks (default: the amber embers). */
  ember?: string;
  /** Colour of the horizon at the foot of the page (default: the tint). */
  horizon?: string;
  /** Living light on points of the painting (AtlasArtGlow). */
  glow?: AtlasGlow;
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
  /** Slim legal line under the content: the text and its links (the "less motion" switch comes first), and an optional brand seal above it. */
  footer?: { legal: ReactNode; links: ReactNode; brand?: ReactNode } | false;
  /**
   * The page's horizon: at the foot of the page the solid body warms into the
   * scene's light — a glow on the horizon, drifting mist, a slow seal of runes
   * behind the brand mark and rising sparks — so the end of a long page is a
   * place too. No second painting: the body stays solid. `false` keeps it plain.
   */
  foot?: boolean;
};

/** "72% 30%" / "center 45%" → [0.72, 0.3] / [0.5, 0.45] (object-position as fractions). */
function objectFocus(position: string | undefined): [number, number] {
  const [x = "center", y = "18%"] = (position ?? "center 18%").split(/\s+/);
  const part = (value: string) => (value === "center" ? 0.5 : value === "left" || value === "top" ? 0 : value === "right" || value === "bottom" ? 1 : parseFloat(value) / 100);
  return [part(x), part(y)];
}

/**
 * Page frame of every inner atlas route: atmosphere artwork, solid body and the
 * 1540 px content column. Pages compose AtlasHero / AtlasSection inside it.
 * The atmosphere is alive: the artwork settles in and drifts slowly, embers rise
 * through the torchlight. All of it is CSS and stops under reduced motion.
 * The app wraps it as `AtlasFrame` (components/atlas), which resolves section
 * scenes and supplies the legal line.
 */
export function AtlasFrameShell({ children, art, artPosition, artShade = "default", tint, ember, horizon, glow, still = false, artLayer, morphKey, as: Element = "main", className, lang, id, dataAttributes, footer = false, foot = true }: AtlasFrameShellProps) {
  const locale = lang === "ru" ? "ru" : "en";
  const layer = artLayer ?? (glow ? <AtlasArtGlow imageSize={glow.size} focus={objectFocus(artPosition)} points={glow.points} /> : null);
  const picture = art ? <Image className={styles.art} src={art} alt="" fill sizes="100vw" quality={50} loading="eager" fetchPriority="high" {...artPlaceholder(art)} /> : null;
  // Section sparks: the spark and its halo in the section's colour.
  const vars: Record<string, string | undefined> = { "--atlas-frame-tint": tint, "--atlas-frame-horizon": horizon, "--atlas-frame-art-position": artPosition };
  if (ember) Object.assign(vars, { "--atlas-ember": ember, "--atlas-ember-halo": `color-mix(in srgb, ${ember} 24%, transparent)` });
  const style = vars as CSSProperties;
  // With morphKey the whole atmosphere (art, shade, embers) is the receiving end of
  // the tapped card's picture, so it lands on exactly what the page shows.
  const atmosphere = (
    <div className={styles.atmosphere} aria-hidden="true" {...(morphKey ? morphSceneProps(morphKey) : {})}>
      <div className={styles.scene}>
        {/* Decorative, but it is the largest paint of every route that has it: fetch it at high priority. */}
        {picture}
        {layer ? <div className={styles.artLayer}>{layer}</div> : null}
        {/* Torchlight over the artwork and a few suspended embers (CSS only). */}
        <span className={styles.embers} />
      </div>
    </div>
  );
  return (
    // Page-to-page motion belongs to the app's route runtime (one owner per
    // navigation); the frame only marks itself and its scene.
    <Element className={clsx(styles.frame, artShade === "deep" && styles.deep, still && styles.still, className)} style={style} lang={lang} id={id} data-atlas-frame data-morph={morphKey ? "" : undefined} {...dataAttributes}>
      {atmosphere}
      {foot ? (
        // The horizon at the foot: the scene's light, drifting mist, a slow seal of
        // runes and sparks rising out of it. CSS only, below the fold on every route.
        <div className={styles.foot} aria-hidden="true" data-atlas-foot>
          <span className={styles.footMist} />
          <span className={styles.footSeal} />
          <span className={styles.footEmbers} />
        </div>
      ) : null}
      <div className={styles.column}>
        {children}
        {footer ? (
          <footer className={styles.legal} data-text-links>
            {footer.brand ? <div className={styles.legalBrand}>{footer.brand}</div> : null}
            <p>{footer.legal}</p>
            <div className={styles.legalLinks}>
              <AtlasMotionToggle locale={locale} />
              {footer.links}
            </div>
          </footer>
        ) : null}
      </div>
    </Element>
  );
}
