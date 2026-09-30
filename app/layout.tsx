import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { CookieNoticeGate } from "@/components/CookieNoticeGate";
import { RouteTransitionGate } from "@/components/motion/RouteTransitionGate";
import { WorkspaceNavigator } from "@/components/platform/navigation/WorkspaceNavigator";
import "./globals.css";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  // Many routes use this family, but the grimoire landing page does not.
  // Let it load when a rendered component actually uses it instead of
  // preloading all three weights on every route.
  preload: false,
});

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  // Body text has a system fallback, so let critical CSS and the LCP image
  // use the initial connection before the shared UI font downloads.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gildra.net"),
  title: "Gildra — Master the Meta",
  description:
    "Live World of Warcraft tier lists, Mythic+ and raid meta statistics, builds and guides.",
  alternates: { languages: { en: "/", ru: "/ru" } },
  openGraph: {
    siteName: "Gildra",
    type: "website",
    title: "Gildra — Master the Meta",
    description:
      "Live World of Warcraft tier lists, Mythic+ and raid meta statistics, builds and guides.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`} data-scroll-behavior="smooth" data-route-theme="wow">
      <body>
        <WorkspaceNavigator />
        <RouteTransitionGate>{children}</RouteTransitionGate>
        <CookieNoticeGate />
      </body>
    </html>
  );
}
