"use client";

import { Link, useNav, usePreferences } from "@payloadcms/ui";
import { usePathname } from "next/navigation";
import React, { useEffect, useLayoutEffect, useRef } from "react";

import { isAdminNavItemActive, type NavItem, type NavSection } from "../../admin/navModel";
import { useFlip } from "../valyro-ui/primitives/useFlip";

/** Laptop widths where Payload hides the sidebar on every page load (it docks it only above 1440 px). */
const LAPTOP = "(min-width: 1025px) and (max-width: 1440px)";
/** Below this the sidebar is an overlay that should close after a link is followed. */
const OVERLAY = "(max-width: 1024px)";

/**
 * Keeps the sidebar docked on laptop screens. Payload closes it on load (and
 * again when it measures the window) up to 1440 px and does not remember the
 * choice there; this reopens it before paint unless the user closed it, and
 * stores the user's own toggles in the same `nav` preference Payload uses on
 * wide screens, so the server renders the right state next time.
 */
function useDockedNav() {
  const { hydrated, navOpen, setNavOpen } = useNav();
  const { setPreference } = usePreferences();
  // The server renders the saved preference; capture it before Payload's own effect closes the sidebar.
  const preferred = useRef(navOpen);
  const last = useRef(navOpen);
  const userAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest?.(".nav-toggler, .nav__mobile-close")) userAt.current = performance.now();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useLayoutEffect(() => {
    const changed = navOpen !== last.current;
    last.current = navOpen;
    if (!hydrated) return;
    const laptop = window.matchMedia(LAPTOP).matches;
    if (performance.now() - userAt.current < 1000) {
      if (changed && laptop) {
        preferred.current = navOpen;
        void setPreference("nav", { open: navOpen }, true);
      }
      return;
    }
    if (!navOpen && laptop && preferred.current) setNavOpen(true);
  }, [hydrated, navOpen, setNavOpen, setPreference]);

  return setNavOpen;
}

function Links({ items, pathname, onFollow }: { items: NavItem[]; pathname: string; onFollow: () => void }) {
  return (
    <ul className="gd-nav__list">
      {items.map((item) => {
        const active = isAdminNavItemActive(pathname, item);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={false}
              className={active ? "gd-nav__link is-active" : "gd-nav__link"}
              aria-current={active ? "page" : undefined}
              onClick={onFollow}
            >
              {active ? <span className="gd-nav__active-marker" data-flip-id="active-section" aria-hidden="true" /> : null}
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sidebar links with the current section highlighted. Links navigate inside
 * the app (no full reload), so the sidebar, the site selector and the open
 * "More" section stay as they are. "More" opens by itself when it holds the
 * current page.
 */
export function AdminNavLinks({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname() ?? "";
  const navRef = useRef<HTMLElement>(null);
  useFlip(navRef, { auto: true, animateEnter: false, spring: "smooth" });
  const setNavOpen = useDockedNav();
  const onFollow = () => {
    if (window.matchMedia(OVERLAY).matches) setNavOpen(false);
  };
  return (
    <nav className="gd-nav" ref={navRef}>
      {sections.map((section, index) => {
        if (section.collapsible) {
          const open = section.items.some((item) => isAdminNavItemActive(pathname, item));
          return (
            <details key={index} className="gd-nav__section gd-nav__more" open={open || undefined}>
              <summary>{section.title}</summary>
              <Links items={section.items} pathname={pathname} onFollow={onFollow} />
            </details>
          );
        }
        return (
          <div key={index} className="gd-nav__section">
            {section.title ? <p className="gd-nav__title">{section.title}</p> : null}
            <Links items={section.items} pathname={pathname} onFollow={onFollow} />
          </div>
        );
      })}
    </nav>
  );
}
