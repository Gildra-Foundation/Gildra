"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchCommand } from "./SearchCommand";
import { altPath, langOf, t, type Lang } from "@/lib/i18n";
import { ANCHORS, anchorHref } from "@/lib/anchors";
import {
  GAMES,
  GAME_ORDER,
  currentGame,
  gameHref,
  type GameSlug,
} from "@/lib/games/registry";

/** Disclosure-меню: клик/Enter/Space открывают, Escape закрывает и
 *  возвращает фокус на триггер, клик вне — закрывает. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, rootRef, btnRef };
}

/** Global header. Game and language come from the page (PageShell); when
 *  rendered outside it (404, root layout) both are derived from the pathname.
 *  Game switcher, Explore tasks and search index all read the game registry. */
export function TopNav({ game: gameSlug, lang: langProp }: { game?: GameSlug; lang?: Lang }) {
  const [mobOpen, setMobOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const explore = useMenu();
  const gameMenu = useMenu();
  const pathname = usePathname();
  const lang = langProp ?? langOf(pathname);
  const game = gameSlug ? GAMES[gameSlug] : currentGame(pathname);
  const tt = t(lang);
  const tasks = game.nav.tasks;

  useEffect(() => {
    document.body.style.overflow = mobOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobOpen]);

  const isCurrent = (path: string) => gameHref(game, lang, path) === pathname;

  return (
    <header className="topnav">
      <button
        className="burger"
        aria-label={mobOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobOpen}
        aria-controls="mobile-menu"
        onClick={() => setMobOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      <Link className="logo" href={gameHref(GAMES.wow, lang, "/")} aria-label="Gildra home">
        <Image
          className="logo-mark"
          src="/brand/helmet.png"
          alt=""
          width={30}
          height={30}
          priority
        />
        <span className="logo-text">GILDRA</span>
      </Link>

      <div className="gsw" ref={gameMenu.rootRef}>
        <button
          ref={gameMenu.btnRef}
          className="gsw-btn"
          aria-expanded={gameMenu.open}
          aria-controls="game-menu"
          onClick={() => gameMenu.setOpen((v) => !v)}
        >
          <svg className="i" aria-hidden="true">
            <use href={game.icon} />
          </svg>{" "}
          <span className="gsw-label">{game.name}</span>
          <span className="gsw-label-sm">{game.shortName}</span>{" "}
          <span className="caret">▾</span>
        </button>
        {gameMenu.open && (
          <div className="gsw-menu game-menu" id="game-menu">
            <div className="exp-cap">{tt("Switch game")}</div>
            <button
              type="button"
              className="gitem on"
              aria-current="true"
              onClick={() => gameMenu.setOpen(false)}
            >
              <span className="gtile gtile-on">
                <svg className="i" aria-hidden="true">
                  <use href={game.icon} />
                </svg>
              </span>
              {game.name}
              <span className="gmark" aria-hidden="true">◆</span>
            </button>
            <div className="gdiv" />
            {GAME_ORDER.filter((s) => s !== game.slug).map((s) => {
              const g = GAMES[s];
              const tile = (
                <span className="gtile">
                  <svg className="i" style={{ color: g.accent }} aria-hidden="true">
                    <use href={g.icon} />
                  </svg>
                </span>
              );
              if (g.status === "soon") {
                return (
                  <button
                    key={g.slug}
                    type="button"
                    className="gitem"
                    aria-disabled="true"
                    title="Coming soon"
                  >
                    {tile}
                    {g.name} <span className="soon">{tt("soon")}</span>
                  </button>
                );
              }
              return (
                <Link
                  key={g.slug}
                  className="gitem"
                  href={gameHref(g, lang, "/")}
                  onClick={() => gameMenu.setOpen(false)}
                >
                  {tile}
                  {g.name}
                  {g.status === "beta" && <span className="soon">{tt("beta")}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="gsw exp" ref={explore.rootRef}>
        <button
          ref={explore.btnRef}
          className="gsw-btn exp-btn"
          aria-expanded={explore.open}
          aria-controls="explore-menu"
          onClick={() => explore.setOpen((v) => !v)}
        >
          {tt("Explore")} <span className="caret">▾</span>
        </button>
        {explore.open && (
          <div className="gsw-menu exp-menu" id="explore-menu">
            <div className="exp-grid">
              {tasks.map((task) => (
                <Link
                  key={task.title}
                  className={`exp-card${isCurrent(task.path) ? " on" : ""}`}
                  href={gameHref(game, lang, task.path)}
                  aria-current={isCurrent(task.path) ? "page" : undefined}
                  onClick={() => explore.setOpen(false)}
                >
                  <span className="exp-tile">
                    <svg className="i" aria-hidden="true">
                      <use href={task.icon} />
                    </svg>
                  </span>
                  <span className="exp-tx">
                    <span className="exp-task">{tt(task.task)}</span>
                    <span className="exp-title">{tt(task.title)}</span>
                    <span className="exp-desc">{tt(task.desc)}</span>
                  </span>
                </Link>
              ))}
            </div>
            <button
              type="button"
              className="exp-foot"
              onClick={() => {
                explore.setOpen(false);
                setSearchOpen(true);
              }}
            >
              <svg className="i" aria-hidden="true">
                <use href="#ic-search" />
              </svg>
              {tt("Looking for a spec or guide? Search Gildra")}
              <span className="kbd">⌘K</span>
            </button>
          </div>
        )}
      </div>

      <div className="nav-spacer" />
      <button
        ref={searchBtnRef}
        className="search"
        type="button"
        aria-label="Search Gildra (Ctrl+K)"
        onClick={() => setSearchOpen(true)}
      >
        <svg className="i" aria-hidden="true">
          <use href="#ic-search" />
        </svg>{" "}
        {tt("Search Gildra...")} <span className="kbd">⌘K</span>
      </button>
      <nav className="lsw" aria-label="Language">
        <Link
          className={lang === "en" ? "on" : undefined}
          href={altPath(pathname ?? "/", "en")}
          aria-current={lang === "en" ? "true" : undefined}
        >
          EN
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          className={lang === "ru" ? "on" : undefined}
          href={altPath(pathname ?? "/", "ru")}
          aria-current={lang === "ru" ? "true" : undefined}
        >
          RU
        </Link>
      </nav>
      <button className="user" type="button" aria-label="Account: Alexandér">
        <span className="avatar" aria-hidden="true" />
        <span className="user-name">Alexandér</span>{" "}
        <span className="caret">▾</span>
      </button>

      {mobOpen && (
        <nav className="mobmenu" id="mobile-menu" aria-label="Mobile">
          <button
            className="mobsearch"
            type="button"
            onClick={() => {
              setMobOpen(false);
              setSearchOpen(true);
            }}
          >
            <svg className="i" aria-hidden="true">
              <use href="#ic-search" />
            </svg>
            {tt("Search Gildra...")}
          </button>
          {tasks.map((task) => (
            <Link
              key={task.title}
              className="mob-task"
              href={gameHref(game, lang, task.path)}
              onClick={() => setMobOpen(false)}
            >
              <span className="exp-task">{tt(task.task)}</span>
              <span className="exp-title">{tt(task.title)}</span>
            </Link>
          ))}
          <Link
            className="mob-prem"
            href={gameHref(GAMES.wow, lang, anchorHref(ANCHORS.premium))}
            onClick={() => setMobOpen(false)}
          >
            {tt("Go Premium")}
          </Link>
        </nav>
      )}

      <SearchCommand
        open={searchOpen}
        game={game}
        lang={lang}
        onOpen={() => setSearchOpen(true)}
        onClose={() => {
          setSearchOpen(false);
          searchBtnRef.current?.focus();
        }}
      />
    </header>
  );
}
