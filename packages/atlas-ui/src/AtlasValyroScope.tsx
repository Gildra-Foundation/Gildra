"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ThemeScope } from "./valyro-ui/theme/ThemeScope";
import { ThemeContext } from "./valyro-ui/theme/ThemeProvider";
import { PortalContainerContext } from "./valyro-ui/primitives/Portal";
import "./valyro-ui/styles/tokens.css";
import "./valyro-public-theme.css";
import "./valyro-ui/styles/base.css";
import "./valyro-public-motion.css";
import bridge from "./valyroAtlasBridge.module.css";

/**
 * Keeps Valyro components and popovers in the site's token scope.
 * `root`: the page-wide scope under an <html> carrying `atlasRootAttributes` (./atlasRoot.ts); it inherits the tokens
 * and only paints text and hosts portaled layers. Without it (portals into <body>, nested themes)
 * the scope re-declares the theme for its subtree.
 */
export function AtlasValyroScope({ children, locale, className, root }: { children: ReactNode; locale?: string; className?: string; root?: boolean }) {
  if (root) return <AtlasRootScope locale={locale} className={className}>{children}</AtlasRootScope>;
  return <ThemeScope theme="vercel" mode="dark" locale={locale} data-atlas-scope className={clsx(bridge.scope, bridge.root, className)}>{children}</ThemeScope>;
}

function AtlasRootScope({ children, locale, className }: { children: ReactNode; locale?: string; className?: string }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ theme: "vercel" as const, mode: "dark" as const, locale }), [locale]);
  return (
    <div className={clsx("ui-theme-scope", bridge.root, className)} data-atlas-scope="true">
      <ThemeContext.Provider value={value}>
        <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
      </ThemeContext.Provider>
      {/* Last child, so layers paint above the scope's content at equal z-index. */}
      <div ref={setContainer} className="ui-theme-scope__layers" />
    </div>
  );
}
