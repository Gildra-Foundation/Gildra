import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { GAMES } from "@/lib/games/registry";
import { t } from "@/lib/i18n";
import clsx from "clsx";
import styles from "./AtlasFrame.module.css";

export type AtlasFrameProps = {
  children: ReactNode;
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
export function AtlasFrame({ children, art, artPosition, artShade = "default", tint, still = false, as: Element = "main", className, lang, id, dataAttributes, footer = true }: AtlasFrameProps) {
  const locale = lang === "ru" ? "ru" : "en";
  const style = { "--atlas-frame-tint": tint, "--atlas-frame-art-position": artPosition } as CSSProperties;
  return (
    <Element className={clsx(styles.frame, artShade === "deep" && styles.deep, still && styles.still, className)} style={style} lang={lang} id={id} {...dataAttributes}>
      <div className={styles.atmosphere} aria-hidden="true">
        {/* Decorative and heavily shaded: fetch it early (it is often the largest paint) but after fonts, CSS and the hero. */}
        {art ? <Image className={styles.art} src={art} alt="" fill sizes="100vw" quality={50} loading="eager" fetchPriority="low" /> : null}
        {/* Torchlight over the artwork: a breathing glow and a few rising embers (CSS only). */}
        <span className={styles.embers} />
      </div>
      <div className={styles.column}>
        {children}
        {footer ? (
          <footer className={styles.legal}>
            <p>{t(locale)(GAMES.wow.legal)}</p>
            <Link href={locale === "ru" ? "/ru/privacy" : "/privacy"} prefetch={false}>{t(locale)("Privacy Policy")}</Link>
          </footer>
        ) : null}
      </div>
    </Element>
  );
}
