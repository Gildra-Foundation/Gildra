"use client";

import type { ReactNode } from "react";
import type { AdminLang } from "../admin/text";
import { ThemeScope } from "./valyro-ui/theme/ThemeScope";
import "./valyro-ui/styles/tokens.css";
import "./valyro-ui/styles/themes/vercel.css";
import "./valyro-ui/styles/base.css";
import "./valyro-ui/styles/motion.css";
import "./admin-surface.css";
import "./workspace/workspace.css";
import "./editorial/editorial.css";

/** Keep Valyro context, portals and tokens inside the custom CMS screens. */
export function AdminSurface({ lang, children }: { lang: AdminLang; children: ReactNode }) {
  return <ThemeScope theme="vercel" mode="dark" locale={lang === "ru" ? "ru-RU" : "en-GB"} className="gd-valyro">{children}</ThemeScope>;
}
