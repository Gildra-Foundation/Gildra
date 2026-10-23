"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { p, type Lang } from "@/lib/i18n-paths";

// Own copy instead of t() from @/lib/i18n: this chip hydrates on every page,
// and importing the shared dictionary put all of it in the global client chunk.
const words = {
  en: { checking: "Checking account…", signInWith: "Sign in with Battle.net", signIn: "Sign in", account: "Account", characters: "My characters" },
  ru: { checking: "Проверяем аккаунт…", signInWith: "Войти через Battle.net", signIn: "Войти", account: "Аккаунт", characters: "Мои персонажи" },
} as const;

type Ready = { state: "ready"; connected: boolean; name: string | null };
type Status = { state: "loading" } | Ready;

/** Last answer seen in this tab, shown straight away on the next page so the
 *  chip does not flash its placeholder on every navigation. Every mount still
 *  asks the server again; the session is never assumed. */
let lastReady: Ready | null = null;

/**
 * The header's real account control. It asks GET /api/auth/status (always
 * no-store) once on mount and never invents a name:
 *  - loading: same-size placeholder (the label slot has a fixed width, see
 *    `.user-name` in components/layout/chrome.css), so the header does not shift;
 *  - signed out (or the status call failed): a "Sign in" link to /login;
 *  - Battle.net connected: the account name, linking to the character roster.
 *
 * Styling hooks default to the TopNav chip (`.user` / `.avatar` / `.user-name`);
 * other headers pass their own classes.
 */
export function AccountChip({
  lang,
  className = "user",
  avatarClassName = "avatar",
  labelClassName = "user-name",
  avatarContent,
  trailing,
}: {
  lang: Lang;
  className?: string;
  avatarClassName?: string;
  labelClassName?: string;
  /** Decorative glyph inside the avatar ring (none by default). */
  avatarContent?: ReactNode;
  /** Decorative arrow/caret shown after the label (kept in every state for a stable width). */
  trailing?: ReactNode;
}) {
  const w = words[lang];
  const [status, setStatus] = useState<Status>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    if (lastReady) setStatus(lastReady);
    fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Account status unavailable");
        const value: unknown = await response.json();
        const body = (value && typeof value === "object" ? value : {}) as { connected?: unknown; accountName?: unknown };
        const connected = body.connected === true;
        const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
        lastReady = { state: "ready", connected, name: connected && accountName ? accountName : null };
        setStatus(lastReady);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ state: "ready", connected: false, name: null });
      });
    return () => controller.abort();
  }, []);

  const avatar = <span className={avatarClassName} aria-hidden="true">{avatarContent}</span>;

  if (status.state === "loading") {
    return (
      <span className={`${className} user-pending`} aria-busy="true">
        {avatar}
        <span className={labelClassName} aria-hidden="true"><i className="user-skel" /></span>
        <span className="sr-only">{w.checking}</span>
        {trailing}
      </span>
    );
  }

  if (!status.connected) {
    return (
      <Link className={className} href={p(lang, "/login")} prefetch={false} aria-label={w.signInWith}>
        {avatar}
        <span className={labelClassName}>{w.signIn}</span>
        {trailing}
      </Link>
    );
  }

  const label = status.name ?? w.characters;
  return (
    <Link
      className={className}
      href={p(lang, "/wow/characters")}
      prefetch={false}
      aria-label={status.name ? `${w.account}: ${status.name}` : label}
      title={status.name ?? undefined}
    >
      {avatar}
      <span className={labelClassName}>{label}</span>
      {trailing}
    </Link>
  );
}
