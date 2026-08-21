import type { Metadata } from "next";
import { Chakra_Petch, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { CookieNotice } from "@/components/CookieNotice";
import { LangAttr } from "@/components/LangAttr";
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
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale} className={`${display.variable} ${ui.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
          <CookieNotice />
          <LangAttr />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
