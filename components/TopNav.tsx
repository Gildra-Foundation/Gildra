"use client";

import { useState } from "react";

const NAV = [
  { label: "Tier Lists", href: "#tierlist", active: true },
  { label: "Mythic+", href: "#mythic" },
  { label: "Raid", href: "#raid" },
  { label: "Builds", href: "#builds" },
  { label: "Guides", href: "#guides" },
];

export function TopNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="topnav">
      <button
        className="burger"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
      <div className="logo">
        <div className="logo-mark">G</div>
        <span className="logo-text">GILDRA</span>
      </div>
      <div className="gsw">
        <button className="gsw-btn" aria-haspopup="true">
          <svg className="i">
            <use href="#gm-wow" />
          </svg>{" "}
          <span className="gsw-label">World of Warcraft</span>
          <span className="gsw-label-sm">WoW</span> <span className="caret">▾</span>
        </button>
        <div className="gsw-menu" role="menu">
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#d95c55" }}>
              <use href="#gm-d4" />
            </svg>{" "}
            Diablo IV
          </a>
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#dfc06a" }}>
              <use href="#gm-hs" />
            </svg>{" "}
            Hearthstone
          </a>
          <a href="#" role="menuitem">
            <svg className="i" style={{ color: "#e8975a" }}>
              <use href="#gm-ow" />
            </svg>{" "}
            Overwatch 2
          </a>
          <a href="#" role="menuitem" className="gsw-more">
            All games →
          </a>
        </div>
      </div>
      <nav className="nav-links" aria-label="Primary">
        {NAV.map((n) => (
          <a key={n.label} className={n.active ? "active" : undefined} href={n.href}>
            {n.label}
          </a>
        ))}
      </nav>
      <div className="nav-spacer" />
      <div className="search">
        <svg className="i">
          <use href="#ic-search" />
        </svg>{" "}
        Search Gildra... <span className="kbd">⌘K</span>
      </div>
      <div className="user">
        <div className="avatar" />
        <span className="user-name">Alexandér</span> <span className="caret">▾</span>
      </div>

      {open && (
        <nav className="mobmenu" aria-label="Mobile">
          <div className="mobsearch">
            <svg className="i">
              <use href="#ic-search" />
            </svg>
            <input type="text" placeholder="Search Gildra..." aria-label="Search" />
          </div>
          {NAV.map((n) => (
            <a key={n.label} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </a>
          ))}
          <a className="mob-prem" href="#" onClick={() => setOpen(false)}>
            Go Premium
          </a>
        </nav>
      )}
    </header>
  );
}
