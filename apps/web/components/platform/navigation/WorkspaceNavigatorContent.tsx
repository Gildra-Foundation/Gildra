"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { altPath, p } from "@/lib/i18n-paths";
import { gameDestinationForPath } from "@/lib/games/destinations";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import { GameSwitcher } from "./GameSwitcher";
import toolbarStyles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** Prerendered 404 pages must hydrate with their original toolbar language. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

const destinations = [
  { href: "/", en: "Home", ru: "Главная" },
  { href: "/wow/characters", en: "Characters", ru: "Персонажи" },
  { href: "/wow/lairs", en: "Bosses", ru: "Боссы" },
  { href: "/wow/mythic-plus", en: "Mythic+", ru: "Mythic+" },
  { href: "/wow/raids", en: "Raids", ru: "Рейды" },
  { href: "/tier-lists", en: "Tier lists", ru: "Тир-листы" },
  { href: "/wow/articles", en: "Articles", ru: "Статьи" },
] as const;

function PrimaryNavigation({ path, ru }: { path: string; ru: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const barePath = path.replace(/^\/ru(?=\/|$)/, "").replace(/\/$/, "") || "/";

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <div ref={root} className={toolbarStyles.navigation}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
    <button ref={trigger} type="button" className={toolbarStyles.menuToggle} aria-controls={id} aria-expanded={open}
      aria-label={ru ? (open ? "Закрыть меню" : "Открыть меню") : (open ? "Close menu" : "Open menu")}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      <span>{ru ? "Меню" : "Menu"}</span>
    </button>
    <nav id={id} className={toolbarStyles.links} data-open={open || undefined} aria-label={ru ? "Основная навигация" : "Main navigation"}>
      {destinations.map(item => {
        const current = item.href === "/" ? barePath === "/" : barePath === item.href || barePath.startsWith(`${item.href}/`);
        return <Link key={item.href} href={p(ru ? "ru" : "en", item.href)} prefetch={false}
          className={toolbarStyles.link} aria-current={current ? "page" : undefined} onClick={() => setOpen(false)}>
          {ru ? item.ru : item.en}
        </Link>;
      })}
    </nav>
  </div>;
}

export function WorkspaceNavigatorContent() {
  const pathname = usePathname();
  const livePath = useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
  const ru = /^\/ru(?:\/|$)/.test(livePath);
  const comingSoon = gameDestinationForPath(livePath).soon;

  return <header className={toolbarStyles.toolbar} data-atlas-scope data-toolbar-path={livePath}>
    <a className={toolbarStyles.skip} href="#atlas-content">{ru ? "К содержанию" : "Skip to content"}</a>
    <PrimaryNavigation key={livePath} path={livePath} ru={ru} />
    <div className={toolbarStyles.end}>
      {!comingSoon && <SiteSearch lang={ru ? "ru" : "en"} />}
      <nav className={toolbarStyles.locale} aria-label={ru ? "Язык" : "Language"}>
        <Link href={altPath(livePath, "en")} hrefLang="en" lang="en" aria-current={ru ? undefined : "true"} prefetch={false}>EN</Link>
        <Link href={altPath(livePath, "ru")} hrefLang="ru" lang="ru" aria-current={ru ? "true" : undefined} prefetch={false}>RU</Link>
      </nav>
      <GameSwitcher key={livePath} lang={ru ? "ru" : "en"} pathname={livePath} />
    </div>
  </header>;
}
