import type { ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import type { Lang } from "@/lib/i18n";
import { GAMES, type GameSlug } from "@/lib/games/registry";

/**
 * The one page chrome: icon sprite, TopNav, `.app > .main`, Footer and the
 * optional Reveal script. Every route renders through it instead of
 * repeating the shell. `variant="route"` wraps children in the `.section
 * .route-section` column used by pages without a hero.
 */
export function PageShell({
  lang = "en",
  game = "wow",
  layout = "default",
  reveal = false,
  footer = true,
  mainClassName,
  variant = "none",
  children,
}: {
  /** Omit only where the page cannot know it (root not-found): TopNav then derives it from the URL. */
  lang?: Lang;
  game?: GameSlug;
  layout?: "default" | "bare";
  reveal?: boolean;
  footer?: boolean;
  mainClassName?: string;
  /** "route" = children inside `.section.route-section`; "none" = children as-is (block pages). */
  variant?: "none" | "route";
  children: ReactNode;
}) {
  const body = variant === "route" ? <div className="section route-section">{children}</div> : children;
  if (layout === "bare") {
    return (
      <>
        <Icons />
        <TopNav game={game} lang={lang} />
        {children}
        {reveal && <Reveal />}
      </>
    );
  }
  return (
    <>
      <Icons />
      <TopNav game={game} lang={lang} />
      <div className="app" data-game={game} style={GAMES[game].theme as React.CSSProperties | undefined}>
        <main className={mainClassName ? `main ${mainClassName}` : "main"}>{body}</main>
        {footer && <Footer lang={lang} game={game} />}
      </div>
      {reveal && <Reveal />}
    </>
  );
}
