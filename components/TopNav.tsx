"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchCommand } from "./SearchCommand";
import { altPath, langOf, p, t } from "@/lib/i18n";

/** Task-based направления Explore — только реальные destinations. */
const TASKS = [
  {
    task: "Compare specs",
    title: "Tier List",
    desc: "Ranked Mythic+ specs with scores",
    href: "/tier-lists",
    icon: "#ic-sword",
  },
  {
    task: "Explore game data",
    title: "Database",
    desc: "Items, spells, quests and more",
    href: "/database",
    icon: "#ic-database",
  },
  {
    task: "Prepare for raid",
    title: "Raid Overview",
    desc: "Manaforge Omega meta and specs",
    href: "/#raid",
    icon: "#ic-shield",
  },
  {
    task: "Learn & improve",
    title: "Latest Guides",
    desc: "Fresh guides for the season",
    href: "/#guides",
    icon: "#ic-book",
  },
];

const GAMES = [
  { label: "Diablo IV", icon: "#gm-d4", color: "#d95c55" },
  { label: "Hearthstone", icon: "#gm-hs", color: "#dfc06a" },
  { label: "Overwatch 2", icon: "#gm-ow", color: "#e8975a" },
];

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

export function TopNav() {
  const [mobOpen, setMobOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBtnRef = useRef<HTMLButtonElement>(null);
  const explore = useMenu();
  const game = useMenu();
  const pathname = usePathname();
  const lang = langOf(pathname);
  const tt = t(lang);

  useEffect(() => {
    document.body.style.overflow = mobOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobOpen]);

  const isCurrent = (href: string) => p(lang, href) === pathname;

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

      <Link className="logo" href={p(lang, "/")} aria-label="Gildra home">
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

      <div className="gsw" ref={game.rootRef}>
        <button
          ref={game.btnRef}
          className="gsw-btn"
          aria-expanded={game.open}
          aria-controls="game-menu"
          onClick={() => game.setOpen((v) => !v)}
        >
          <svg className="i" aria-hidden="true">
            <use href="#gm-wow" />
          </svg>{" "}
          <span className="gsw-label">World of Warcraft</span>
          <span className="gsw-label-sm">WoW</span>{" "}
          <span className="caret">▾</span>
        </button>
        {game.open && (
          <div className="gsw-menu game-menu" id="game-menu">
            <div className="exp-cap">{tt("Switch game")}</div>
            <button
              type="button"
              className="gitem on"
              aria-current="true"
              onClick={() => game.setOpen(false)}
            >
              <span className="gtile gtile-on">
                <svg className="i" aria-hidden="true">
                  <use href="#gm-wow" />
                </svg>
              </span>
              World of Warcraft
              <span className="gmark" aria-hidden="true">◆</span>
            </button>
            <div className="gdiv" />
            {GAMES.map((g) => (
              <button
                key={g.label}
                type="button"
                className="gitem"
                aria-disabled="true"
                title="Coming soon"
              >
                <span className="gtile">
                  <svg className="i" style={{ color: g.color }} aria-hidden="true">
                    <use href={g.icon} />
                  </svg>
                </span>
                {g.label} <span className="soon">{tt("soon")}</span>
              </button>
            ))}
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
              {TASKS.map((t) => (
                <Link
                  key={t.title}
                  className={`exp-card${isCurrent(t.href) ? " on" : ""}`}
                  href={p(lang, t.href)}
                  aria-current={isCurrent(t.href) ? "page" : undefined}
                  onClick={() => explore.setOpen(false)}
                >
                  <span className="exp-tile">
                    <svg className="i" aria-hidden="true">
                      <use href={t.icon} />
                    </svg>
                  </span>
                  <span className="exp-tx">
                    <span className="exp-task">{tt(t.task)}</span>
                    <span className="exp-title">{tt(t.title)}</span>
                    <span className="exp-desc">{tt(t.desc)}</span>
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
          {TASKS.map((t) => (
            <Link
              key={t.title}
              className="mob-task"
              href={p(lang, t.href)}
              onClick={() => setMobOpen(false)}
            >
              <span className="exp-task">{tt(t.task)}</span>
              <span className="exp-title">{tt(t.title)}</span>
            </Link>
          ))}
          <Link
            className="mob-prem"
            href={p(lang, "/#premium")}
            onClick={() => setMobOpen(false)}
          >
            {tt("Go Premium")}
          </Link>
        </nav>
      )}

      <SearchCommand
        open={searchOpen}
        onOpen={() => setSearchOpen(true)}
        onClose={() => {
          setSearchOpen(false);
          searchBtnRef.current?.focus();
        }}
      />
    </header>
  );
}
