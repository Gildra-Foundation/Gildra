import type { ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { Reveal } from "@/components/Reveal";
import type { Lang } from "@/lib/i18n";
import { GAMES, type GameSlug } from "@/lib/games/registry";

/**
 * The page wrapper of block and catalog pages: icon sprite, `.app > .main` and
 * the optional Reveal script. Navigation and the legal footer come from the
 * global atlas bar (app/layout.tsx) and AtlasFrame, so the shell renders no
 * header or footer of its own. `variant="route"` wraps children in the
 * `.section .route-section` column used by pages without a hero.
 */
export function PageShell({
  lang = "en",
  game = "wow",
  layout = "default",
  reveal = false,
  mainClassName,
  variant = "none",
  children,
}: {
  lang?: Lang;
  game?: GameSlug;
  layout?: "default" | "bare";
  reveal?: boolean;
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
        {children}
        {reveal && <Reveal />}
      </>
    );
  }
  return (
    <>
      <Icons />
      <div className="app" data-game={game} lang={lang} style={GAMES[game].theme as React.CSSProperties | undefined}>
        <main className={mainClassName ? `main ${mainClassName}` : "main"}>{body}</main>
      </div>
      {reveal && <Reveal />}
    </>
  );
}
