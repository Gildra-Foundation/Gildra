"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MaterialLinkButton } from "@/components/wow/shared/material/MaterialButton";
import type { Lang as Locale } from "@/lib/i18n-paths";

const copy = {
  en: {
    title: "This page fell in battle",
    lede: "The route was moved or no longer exists. The World of Warcraft hub lists every section that is live today.",
    hub: "Open the WoW hub",
    mythic: "Mythic+ atlas",
  },
  ru: {
    title: "Эта страница пала в бою",
    lede: "Похоже, маршрут перенесён или больше не существует. Все разделы, которые работают сегодня, собраны в центре World of Warcraft.",
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

export function NotFoundActions({ locale }: { locale?: Locale }) {
  const { text, prefix } = useNotFoundCopy(locale);
  return <>
    <MaterialLinkButton kit="den-of-nalorakk" fit="stack" variant="primary" href={`${prefix}/wow`} iconAfter={<ArrowRight aria-hidden="true" />}>{text.hub}</MaterialLinkButton>
    <MaterialLinkButton kit="den-of-nalorakk" fit="stack" href={`${prefix}/wow/mythic-plus`}>{text.mythic}</MaterialLinkButton>
  </>;
}

type Words = { en: string; ru: string };

/** A string the server knows in both languages; the 404 shows the URL's. */
export function NotFoundText({ en, ru }: Words) {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  return <>{ruUrl ? ru : en}</>;
}

export function NotFoundFooterLinks({ whatsNew, privacy }: { whatsNew: Words; privacy: Words }) {
  const ruUrl = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  const lang = ruUrl ? "ru" : "en";
  const prefix = ruUrl ? "/ru" : "";
  return <>
    <Link href={`${prefix}/wow/whats-new`} prefetch={false}>{whatsNew[lang]}</Link>
    <Link href={`${prefix}/privacy`} prefetch={false}>{privacy[lang]}</Link>
  </>;
}
