"use client";

import type { ComponentProps } from "react";
import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { MaterialButton, MaterialLinkButton } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { battleNetActionsCopy } from "@/components/auth/battleNetActionsCopy";
import styles from "./characterAtlas.module.css";

type Fit = { fit?: "block" | "stack" };

/** The shared painted button (design.md §4.1) wearing the Frost art of the Characters section. */
export function FrostButton({ className, ...props }: Fit & Omit<ComponentProps<typeof MaterialButton>, "kit">) {
  return <MaterialButton kit={CHARACTERS_KIT} {...props} className={`${styles.frostButton} ${className ?? ""}`} />;
}

export function FrostLinkButton({ className, ...props }: Fit & Omit<ComponentProps<typeof MaterialLinkButton>, "kit">) {
  return <MaterialLinkButton kit={CHARACTERS_KIT} {...props} className={`${styles.frostButton} ${className ?? ""}`} />;
}

const rosterHref = (locale: "en" | "ru") => (locale === "ru" ? "/ru/wow/characters" : "/wow/characters");

/** Battle.net sign-in (or reconnect with a fresh consent screen); returns to the roster. */
export function CharacterSignInButton({ locale, reconnect = false, fit = "stack" }: { locale: "en" | "ru"; reconnect?: boolean } & Fit) {
  const copy = battleNetActionsCopy[locale];
  return <form onSubmit={(event) => { event.preventDefault(); void signIn("battlenet", { redirectTo: rosterHref(locale) }, reconnect ? { prompt: "consent" } : undefined); }}>
    <FrostButton type="submit" variant="primary" fit={fit} icon={<LogIn aria-hidden="true" />} data-battlenet-signin>
      {reconnect ? copy.reconnect : copy.signInWithBattle}
    </FrostButton>
  </form>;
}

export function CharacterSignOutButton({ locale, fit = "stack" }: { locale: "en" | "ru" } & Fit) {
  return <form data-book-navigation-target={rosterHref(locale)} onSubmit={(event) => { event.preventDefault(); void signOut({ redirectTo: rosterHref(locale) }); }}>
    <FrostButton type="submit" fit={fit} icon={<LogOut aria-hidden="true" />} data-battlenet-signout>
      {battleNetActionsCopy[locale].signOut}
    </FrostButton>
  </form>;
}
