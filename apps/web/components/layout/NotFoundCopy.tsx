"use client";

import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import { FooterNavigation } from "@/components/atlas/FooterNavigation";
import { FooterLanguage } from "@/components/atlas/FooterLanguage";
import { ArrowRight } from "lucide-react";
import { AtlasMotionToggle } from "@gildra/atlas-ui/AtlasMotionToggle";
import { MaterialSlotLinkButton } from "@/components/wow/shared/material/MaterialButtonBase";
import type { Lang as Locale } from "@/lib/i18n-paths";

const copy = {
  en: {
    title: "This page fell in battle",
    lede: "The route was moved or no longer exists.",
    hub: "Open the WoW hub",
    mythic: "Mythic+ atlas",
  },
  ru: {
    title: "Эта страница пала в бою",
    lede: "Маршрут перенесён или больше не существует.",
    hub: "Открыть центр WoW",
    mythic: "Атлас Mythic+",
  },
};

const subscribe = () => () => {};
const isRussianUrl = () => /^\/ru(?:\/|$)/.test(window.location.pathname);


/** The locale-dependent parts of the 404. A tree's not-found (app/(site), app/ru)
 *  knows its language and renders it on the server; the 404 of unmatched URLs
 *  (app/global-not-found.tsx) is prerendered once in English and the URL picks
 *  the language after hydration. The server snapshot keeps hydration consistent. */
function useNotFoundCopy(locale?: Locale) {
  const ru = useSyncExternalStore(subscribe, isRussianUrl, () => locale === "ru");
  return { text: copy[ru ? "ru" : "en"], prefix: ru ? "/ru" : "" };
}

export function NotFoundTitle({ locale }: { locale?: Locale }) {
  const { text } = useNotFoundCopy(locale);
  useEffect(() => { document.title = `${text.title} — Gildra`; }, [text.title]);
  return <>{text.title}</>;
}

export function NotFoundLede({ locale }: { locale?: Locale }) {
  return <>{useNotFoundCopy(locale).text.lede}</>;
}

/** `slotStyle`: the painted kit's button geometry, computed on the server (NotFoundPage). */
export function NotFoundActions({ locale, slotStyle }: { locale?: Locale; slotStyle: CSSProperties }) {
  const { text, prefix } = useNotFoundCopy(locale);
  return <>
    <MaterialSlotLinkButton slotStyle={slotStyle} fit="stack" variant="primary" href={prefix || "/"} iconAfter={<ArrowRight aria-hidden="true" />}>{text.hub}</MaterialSlotLinkButton>
    <MaterialSlotLinkButton slotStyle={slotStyle} fit="stack" href={`${prefix}/wow/mythic-plus`}>{text.mythic}</MaterialSlotLinkButton>
  </>;
}

type Words = { en: string; ru: string };

/** A string the server knows in both languages; the 404 shows the URL's. */
export function NotFoundText({ en, ru }: Words) {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  return <>{ruUrl ? ru : en}</>;
}

/** The footer links (components/atlas/footerLinks.ts) in the URL's language. */
export function NotFoundFooterLinks() {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  const lang = ruUrl ? "ru" : "en";
  return <FooterNavigation locale={lang} />;
}

/** The footer's "Less motion" switch in the URL's language. */
export function NotFoundMotionToggle() {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  return <AtlasMotionToggle locale={ruUrl ? "ru" : "en"} />;
}

export function NotFoundFooterLanguage() {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  return <FooterLanguage locale={ruUrl ? "ru" : "en"} missing />;
}
