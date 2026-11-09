import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alegreya, Chakra_Petch, Inter } from "next/font/google";
import { AtlasValyroScope } from "@gildra/atlas-ui/AtlasValyroScope";
import { atlasRootAttributes, atlasBridgeClassName } from "@gildra/atlas-ui/atlasRoot";
import "../globals.css";

// The API console is a service page of api.wowarcana.com: its own root layout,
// without the site header, menu, cookie notice or analytics of the public pages.

const display = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", preload: false });
const ui = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-ui", preload: false });
const atlasDisplay = Alegreya({ subsets: ["latin", "cyrillic"], variable: "--font-atlas-display", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL("https://wowarcana.com"),
  title: "Gildra API",
  robots: { index: false, follow: false },
};

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${atlasDisplay.variable} ${atlasBridgeClassName}`} {...atlasRootAttributes} data-route-theme="wow">
      <body><AtlasValyroScope root locale="en-GB">{children}</AtlasValyroScope></body>
    </html>
  );
}
