"use client";

import { usePathname } from "next/navigation";
import React from "react";

type NavItem = { href: string; label: string; exact?: boolean };
export type NavSection = { title?: string; collapsible?: boolean; items: (NavItem | null)[] };

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Links({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="gd-nav__list">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <li key={item.href}>
            <a href={item.href} className={active ? "gd-nav__link is-active" : "gd-nav__link"} aria-current={active ? "page" : undefined}>
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Sidebar links with the current section highlighted; "More" opens by itself when it holds the current page. */
export function AdminNavLinks({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="gd-nav">
      {sections.map((section, index) => {
        const items = section.items.filter((item): item is NavItem => item !== null);
        if (section.collapsible) {
          const open = items.some((item) => isActive(pathname, item));
          return (
            <details key={index} className="gd-nav__section gd-nav__more" open={open || undefined}>
              <summary>{section.title}</summary>
              <Links items={items} pathname={pathname} />
            </details>
          );
        }
        return (
          <div key={index} className="gd-nav__section">
            {section.title ? <p className="gd-nav__title">{section.title}</p> : null}
            <Links items={items} pathname={pathname} />
          </div>
        );
      })}
    </nav>
  );
}
