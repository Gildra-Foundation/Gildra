"use client";

import clsx from "clsx";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import buttonStyles from "@/components/atlas/AtlasButton.module.css";

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
    mythic: "Маршруты Mythic+",
  },
};

const subscribe = () => () => {};
const isRussianUrl = () => /^\/ru(?:\/|$)/.test(window.location.pathname);

/** The locale-dependent parts of the 404. The root not-found is evaluated for
 *  every route, so it cannot read request headers without making the whole site
 *  dynamic, and its HTML is prerendered once (English). The URL picks the
 *  language after hydration; the server snapshot keeps hydration consistent. */
function useNotFoundCopy() {
  const ru = useSyncExternalStore(subscribe, isRussianUrl, () => false);
  return { text: copy[ru ? "ru" : "en"], prefix: ru ? "/ru" : "" };
}

export function NotFoundTitle() {
  return <>{useNotFoundCopy().text.title}</>;
}

export function NotFoundLede() {
  return <>{useNotFoundCopy().text.lede}</>;
}

export function NotFoundActions() {
  const { text, prefix } = useNotFoundCopy();
  return <>
    <Link className={clsx(buttonStyles.button, buttonStyles.primary)} href={`${prefix}/wow`}><span>{text.hub}</span><ArrowRight aria-hidden="true" /></Link>
    <Link className={buttonStyles.button} href={`${prefix}/wow/mythic-plus`}><span>{text.mythic}</span></Link>
  </>;
}
