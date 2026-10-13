"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { battleNetActionsCopy } from "./battleNetActionsCopy";

export function BattleNetSignIn({ locale, reconnect = false }: { locale: "en" | "ru"; reconnect?: boolean }) {
  const callbackUrl = locale === "ru" ? "/ru/wow/characters" : "/wow/characters";
  return <form onSubmit={(event) => { event.preventDefault(); void signIn("battlenet", { redirectTo: callbackUrl }, reconnect ? { prompt: "consent" } : undefined); }}>
    <button data-folio-action type="submit"><LogIn aria-hidden="true" />{reconnect ? battleNetActionsCopy[locale].reconnect : battleNetActionsCopy[locale].signInWithBattle}</button>
  </form>;
}

export function BattleNetSignOut({ locale }: { locale: "en" | "ru" }) {
  const callbackUrl = locale === "ru" ? "/ru/wow/characters" : "/wow/characters";
  return <form data-book-navigation-target={callbackUrl} onSubmit={(event) => { event.preventDefault(); void signOut({ redirectTo: callbackUrl }); }}>
    <button data-folio-action="quiet" type="submit"><LogOut aria-hidden="true" />{battleNetActionsCopy[locale].signOut}</button>
  </form>;
}
