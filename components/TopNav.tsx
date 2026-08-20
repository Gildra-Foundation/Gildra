"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const EXPLORE = [
  {
    group: "Mythic+",
    items: [
      { label: "Meta overview", href: "/#meta" },
      { label: "Tier list", href: "/tier-lists" },
      { label: "Featured builds", href: "/tier-lists#builds" },
    ],
  },
  {
    group: "Raid",
    items: [{ label: "Current raid", href: "/#raid" }],
  },
  {
    group: "Content",
    items: [{ label: "Latest guides", href: "/#guides" }],
  },
];

const GAMES = [
  { label: "Diablo IV", icon: "#gm-d4", color: "#d95c55" },
  { label: "Hearthstone", icon: "#gm-hs", color: "#dfc06a" },
  { label: "Overwatch 2", icon: "#gm-ow", color: "#e8975a" },
];

/** Дропдаун с корректной клавиатурой: клик/Enter/Space открывают,
 *  Escape закрывает и возвращает фокус на триггер, клик вне — закрывает. */
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
  const explore = useMenu();
  const game = useMenu();

  // scroll-lock под открытым мобильным меню
  useEffect(() => {
    document.body.style.overflow = mobOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobOpen]);

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

      <Link className="logo" href="/" aria-label="Gildra home">
        <div className="logo-mark">G</div>
        <span className="logo-text">GILDRA</span>
      </Link>

      <div className="gsw" ref={game.rootRef}>
        <button
          ref={game.btnRef}
          className="gsw-btn"
          aria-haspopup="menu"
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
          <div className="gsw-menu" id="game-menu" role="menu">
            {GAMES.map((g) => (
              <button
                key={g.label}
                type="button"
                role="menuitem"
                aria-disabled="true"
                title="Coming soon"
              >
                <svg className="i" style={{ color: g.color }} aria-hidden="true">
                  <use href={g.icon} />
                </svg>{" "}
                {g.label} <span className="soon">soon</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="gsw exp" ref={explore.rootRef}>
        <button
          ref={explore.btnRef}
          className="gsw-btn exp-btn"
          aria-haspopup="menu"
          aria-expanded={explore.open}
          aria-controls="explore-menu"
          onClick={() => explore.setOpen((v) => !v)}
        >
          Explore <span className="caret">▾</span>
        </button>
        {explore.open && (
          <div className="gsw-menu exp-menu" id="explore-menu" role="menu">
            {EXPLORE.map((g) => (
              <div className="exp-group" key={g.group}>
                <div className="exp-cap">{g.group}</div>
                {g.items.map((it) => (
                  <Link
                    key={it.label}
                    href={it.href}
                    role="menuitem"
                    onClick={() => explore.setOpen(false)}
                  >
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="nav-spacer" />
      <button className="search" type="button" aria-label="Search Gildra">
        <svg className="i" aria-hidden="true">
          <use href="#ic-search" />
        </svg>{" "}
        Search Gildra... <span className="kbd">⌘K</span>
      </button>
      <button className="user" type="button" aria-label="Account: Alexandér">
        <span className="avatar" aria-hidden="true" />
        <span className="user-name">Alexandér</span>{" "}
        <span className="caret">▾</span>
      </button>

      {mobOpen && (
        <nav className="mobmenu" id="mobile-menu" aria-label="Mobile">
          <div className="mobsearch">
            <svg className="i" aria-hidden="true">
              <use href="#ic-search" />
            </svg>
            <input
              type="text"
              placeholder="Search Gildra..."
              aria-label="Search"
            />
          </div>
          {EXPLORE.map((g) => (
            <div className="mob-group" key={g.group}>
              <div className="exp-cap">{g.group}</div>
              {g.items.map((it) => (
                <Link
                  key={it.label}
                  href={it.href}
                  onClick={() => setMobOpen(false)}
                >
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
          <Link className="mob-prem" href="/#premium" onClick={() => setMobOpen(false)}>
            Go Premium
          </Link>
        </nav>
      )}
    </header>
  );
}
