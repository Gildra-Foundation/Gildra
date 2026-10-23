"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { ThemeScope } from "./valyro-ui/theme/ThemeScope";
import "./valyro-ui/styles/tokens.css";
import "./valyro-public-theme.css";
import "./valyro-ui/styles/base.css";
import "./valyro-public-motion.css";
import bridge from "./valyroAtlasBridge.module.css";

/** Keeps Valyro popovers in the site's token scope without mutating html theme. */
export function AtlasValyroScope({ children, locale, className }: { children: ReactNode; locale?: string; className?: string }) {
  return <ThemeScope theme="vercel" mode="dark" locale={locale} data-atlas-scope className={clsx(bridge.scope, bridge.root, className)}>{children}</ThemeScope>;
}
