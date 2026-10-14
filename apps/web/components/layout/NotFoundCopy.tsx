"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import buttonStyles from "@gildra/atlas-ui/AtlasButton.module.css";

const copy = {
  en: {
    title: "This page fell in battle",
    lede: "The route was moved or no longer exists. The World of Warcraft hub lists every section that is live today.",
    hub: "Open the WoW hub",
    mythic: "Mythic+ routes",
  },
  ru: {
    title: "Эта страница пала в бою",
    lede: "Похоже, маршрут перенесён или больше не существует. Все разделы, которые работают сегодня, собраны в центре World of Warcraft.",
    hub: "Открыть центр WoW",
    mythic: "Маршруты Эпохальный+",
  },
};

const subscribe = () => () => {};
const isRussianUrl = () => /^\/ru(?:\/|$)/.test(window.location.pathname);

type Locale = "en" | "ru";

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
    <Link className={clsx(buttonStyles.button, buttonStyles.primary)} href={`${prefix}/wow`}><span>{text.hub}</span><ArrowRight aria-hidden="true" /></Link>
    <Link className={buttonStyles.button} href={`${prefix}/wow/mythic-plus`}><span>{text.mythic}</span></Link>
  </>;
}
