import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alegreya, Chakra_Petch, Inter } from "next/font/google";
import { CookieNoticeGate } from "@/components/CookieNoticeGate";
import { PlausibleTracker } from "@/components/cms/PlausibleTracker";
import { WebVitals } from "@/components/analytics/WebVitals";
import { StagingBadge } from "@/components/StagingBadge";
import { plausibleTracker } from "@/lib/cms/plausible";
import { RouteTransitionGate } from "@/components/motion/RouteTransitionGate";
import { WorkspaceNavigator } from "@/components/platform/navigation/WorkspaceNavigator";
import { motionPreferenceScript } from "@/lib/client/motionPreference";
import { SiteTheme } from "@/components/motion/SiteTheme";
import { siteThemeScript } from "@/components/platform/home/homeThemes";
import { localeArrivalScript } from "@/components/platform/locale/localeArrivalScript";
import { AtlasValyroScope } from "@gildra/atlas-ui/AtlasValyroScope";
import "./globals.css";

// The site has two root layouts — English (app/(site)/layout.tsx) and Russian
// (app/ru/layout.tsx) — so the server sends the right <html lang>. Both, and the
// 404 of unmatched URLs (app/global-not-found.tsx), render this one document.

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  // Many routes use this family, but the grimoire landing page does not.
  // Let it load when a rendered component actually uses it instead of
  // preloading all three weights on every route.
  preload: false,
});

// Variable Inter: one file per script covers every weight the UI uses.
const ui = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-ui",
  // Body text has a system fallback, so let critical CSS and the LCP image
  // use the initial connection before the shared UI font downloads.
  preload: false,
});

// Display serif of the inner atlas pages (--atlas-font-display). Alegreya has a
// full Cyrillic set, so Russian and English headings share one design instead
// of falling back to whatever Georgia substitute the device has.
const atlasDisplay = Alegreya({
  subsets: ["latin", "cyrillic"],
  variable: "--font-atlas-display",
  // Headings render immediately in the metric-matched fallback; the landing
  // scene does not use this family, so it is not preloaded there.
  preload: false,
});

const rootWords = {
  en: { title: "Gildra — Master the Meta", description: "World of Warcraft tier lists, Mythic+ and raid statistics, builds and guides." },
  ru: { title: "Gildra — мета World of Warcraft", description: "Тир-листы World of Warcraft, статистика Mythic+ и рейдов, билды и гайды." },
} as const;

/**
 * Defaults of every page in one language tree. No og:title/description and no
 * hreflang here: a page without its own would inherit the home page's (link
 * previews fall back to the page <title>, alternates belong to each page).
 */
export function rootMetadataFor(lang: "en" | "ru"): Metadata {
  return {
    metadataBase: new URL("https://gildra.net"),
    title: rootWords[lang].title,
    description: rootWords[lang].description,
    openGraph: { siteName: "Gildra", type: "website", locale: lang === "ru" ? "ru_RU" : "en_US" },
    twitter: { card: "summary_large_image" },
  };
}

export const rootMetadata = rootMetadataFor("en");

export function RootDocument({ lang, children }: { lang: "en" | "ru"; children: ReactNode }) {
  return (
    // suppressHydrationWarning: the head script may set data-motion before React hydrates.
    <html lang={lang} className={`${display.variable} ${ui.variable} ${atlasDisplay.variable}`} data-scroll-behavior="smooth" data-route-theme="wow" suppressHydrationWarning>
      <head>
        {/* The reader's "less motion" choice, applied before the first paint (lib/client/motionPreference.ts). */}
        <script dangerouslySetInnerHTML={{ __html: motionPreferenceScript + ";" + siteThemeScript + ";" + localeArrivalScript }} />
      </head>
      <body>
        <SiteTheme>
          <AtlasValyroScope locale={lang === "ru" ? "ru-RU" : "en-GB"}>
            <WorkspaceNavigator />
            <RouteTransitionGate>{children}</RouteTransitionGate>
          </AtlasValyroScope>
        </SiteTheme>
        <CookieNoticeGate />
        <PlausibleTracker />
        {plausibleTracker() ? <WebVitals /> : null}
        <StagingBadge />
      </body>
    </html>
  );
}
