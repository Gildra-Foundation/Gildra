import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import "./globals.css";

const display = Chakra_Petch({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const ui = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gildra.vercel.app"),
  title: "Gildra — Master the Meta",
  description:
    "Live World of Warcraft tier lists, Mythic+ and raid meta statistics, builds and guides.",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
