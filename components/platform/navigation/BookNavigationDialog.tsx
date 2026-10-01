"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowRight, Home, Users, Map, Shield, Skull, Search, Compass, LogIn, UserRound, type LucideIcon } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import styles from "./bookNavigation.module.css";

type NavigationItem = { href: string; ru: string; en: string; icon: LucideIcon };

// Same destinations, labels and grouping as the former WorkspaceNavigator.
const primaryItems: NavigationItem[] = [
  { href: "/", ru: "Игровой портал", en: "Game portal", icon: Home },
  { href: "/wow/characters", ru: "Персонажи", en: "Characters", icon: Users },
  { href: "/wow/mythic-plus", ru: "Mythic+", en: "Mythic+", icon: Map },
  { href: "/wow/raids", ru: "Рейдовый журнал", en: "Raid journal", icon: Shield },
  { href: "/wow/lairs", ru: "Логова и мировые боссы", en: "Lairs & world bosses", icon: Skull },
];
const utilityItems: NavigationItem[] = [
  { href: "/search", ru: "Поиск по Азероту", en: "Search Azeroth", icon: Search },
];
// WoW-only MVP: the former "Other worlds archive" (/genshin) entry is gone —
// that route answers 404 (lib/mvp.ts).
const archiveItems: NavigationItem[] = [
  { href: "/wow", ru: "Обзор World of Warcraft", en: "World of Warcraft overview", icon: Compass },
];

const bookTransitionsEnabled = process.env.NODE_ENV !== "development"
  || process.env.NEXT_PUBLIC_ENABLE_DEV_BOOK_TRANSITIONS === "1";
const routePrefetchEnabled = process.env.NODE_ENV !== "development";

function warmBookRouteScene() {
  if (bookTransitionsEnabled && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    void import("@/components/motion/BookRouteScene");
  }
}

export function BookNavigationDialog({ open, onClose, lang }: { open: boolean; onClose: () => void; lang: Lang }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const previousPath = useRef(pathname);
  const [account, setAccount] = useState<{ state: "idle" | "loading" | "ready"; connected: boolean; name?: string }>({ state: "idle", connected: false });
  const ru = lang === "ru";
  const prefix = ru ? "/ru" : "";
  const battleNetConnected = account.connected;
  // A connected account always goes to its real character roster; there is no
  // other profile page (the sample /profile/arcanist is hidden, lib/mvp.ts).
  const accountHref = prefix + (battleNetConnected ? "/wow/characters" : "/login");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) {
      if (!element.open) element.showModal();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previousOverflow; if (element.open) element.close(); };
    }
    if (element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setAccount({ state: "loading", connected: false });
    const request = window.setTimeout(() => {
      fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Account status unavailable");
          const value: unknown = await response.json();
          if (!value || typeof value !== "object") throw new Error("Invalid account status");
          const status = value as { connected?: unknown; accountName?: unknown };
          const connected = status.connected === true;
          setAccount({
            state: "ready",
            connected,
            name: connected && typeof status.accountName === "string" ? status.accountName : undefined,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setAccount({ state: "ready", connected: false });
        });
    }, 0);
    return () => { window.clearTimeout(request); controller.abort(); };
  }, [open]);
  useEffect(() => {
    if (previousPath.current !== pathname) { previousPath.current = pathname; onClose(); }
  }, [pathname, onClose]);
  const links = (items: NavigationItem[]) => items.map((item) => {
    const Icon = item.icon;
    const href = item.href === "/" ? prefix || "/" : prefix + item.href;
    const active = item.href === "/" || item.href === "/wow" ? pathname === href : pathname === href || pathname.startsWith(href + "/");
    const warmDestination = () => {
      if (!routePrefetchEnabled) return;
      router.prefetch(href);
      warmBookRouteScene();
    };
    return <Link key={item.href} className={styles.entry} href={href} prefetch={false}
      aria-current={active ? "page" : undefined} onPointerEnter={warmDestination} onFocus={warmDestination} onClick={onClose}>
      <Icon className={styles.entryIcon} size={24} aria-hidden="true" />
      <span>{ru ? item.ru : item.en}</span>
      <ArrowRight className={styles.arrow} size={18} aria-hidden="true" />
    </Link>;
  });
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="gildra-book-contents-title"
    onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"))
        .filter((element) => element.getClientRects().length > 0);
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}>
    <div className={styles.volume} style={physicalBookMaterials as CSSProperties}>
      <PhysicalBookFrame />
      <button className={styles.close} type="button" onClick={onClose} autoFocus aria-label={ru ? "Закрыть книгу" : "Close the book"}><X size={20} /></button>
      <div className={styles.spread}>
        <section className={styles.leaf}>
          <h2 id="gildra-book-contents-title">{ru ? "Боевой штаб" : "War room"}</h2>
          <nav aria-label={ru ? "Боевой штаб" : "War room"}>{links(primaryItems)}</nav>
        </section>
        <section className={styles.leaf}>
          <h2>{ru ? "Инструменты" : "Tools"}</h2>
          <nav aria-label={ru ? "Инструменты" : "Tools"}>{links(utilityItems)}</nav>
          <h2 className={styles.archiveHeading}>{ru ? "Архивы и система" : "Archives & system"}</h2>
          <nav aria-label={ru ? "Архивы и система" : "Archives & system"}>{links(archiveItems)}</nav>
          <Link className={styles.account} href={accountHref}
            aria-disabled={account.state === "loading" || undefined}
            onPointerEnter={routePrefetchEnabled ? () => router.prefetch(accountHref) : undefined}
            onFocus={routePrefetchEnabled ? () => router.prefetch(accountHref) : undefined}
            onClick={(event) => { if (account.state === "loading") event.preventDefault(); else onClose(); }} prefetch={false}>
            {battleNetConnected ? <UserRound size={23} aria-hidden="true" /> : <LogIn size={23} aria-hidden="true" />}
            <span>{account.state === "loading"
              ? (ru ? "Проверяем аккаунт…" : "Checking account…")
              : battleNetConnected ? account.name ?? (ru ? "Персонажи аккаунта" : "Account characters") : (ru ? "Войти через Battle.net" : "Sign in with Battle.net")}</span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  </dialog>;
}
