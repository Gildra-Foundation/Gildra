"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { battleNetActionsCopy } from "./battleNetActionsCopy";
import styles from "./battleNetActions.module.css";

function BattleNetAction({ locale, action, reconnect = false }: {
  locale: "en" | "ru"; action: "signin" | "signout"; reconnect?: boolean;
}) {
  const copy = battleNetActionsCopy[locale];
  const callbackUrl = locale === "ru" ? "/ru/wow/characters" : "/wow/characters";
  const signingOut = action === "signout";
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const errorId = useId();
  const progress = signingOut ? copy.signingOut : copy.openingBattleNet;

  useEffect(() => {
    // Returning from the provider via browser Back can restore this pending form.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setPending(false);
      setFailed(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      if (signingOut) await signOut({ redirectTo: callbackUrl });
      else await signIn("battlenet", { redirectTo: callbackUrl }, reconnect ? { prompt: "consent" } : undefined);
      // Keep the form busy until Auth.js completes its existing redirect.
    } catch {
      inFlight.current = false;
      setPending(false);
      setFailed(true);
    }
  };

  return <form className={styles.form} onSubmit={submit}>
    <AtlasButton
      data-folio-action={signingOut ? "quiet" : true}
      type="submit"
      variant={signingOut ? "ghost" : "primary"}
      loading={pending}
      aria-describedby={failed ? errorId : undefined}
      icon={signingOut ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}
    >{pending ? progress : signingOut ? copy.signOut : reconnect ? copy.reconnect : copy.signInWithBattle}</AtlasButton>
    <span className={styles.status} role="status">{pending ? progress : ""}</span>
    {failed ? <p className={styles.error} id={errorId} role="alert"><AlertCircle aria-hidden="true" /><span>{signingOut ? copy.signOutFailed : copy.signInFailed}</span></p> : null}
  </form>;
}

export function BattleNetSignIn({ locale, reconnect = false }: { locale: "en" | "ru"; reconnect?: boolean }) {
  return <BattleNetAction locale={locale} action="signin" reconnect={reconnect} />;
}

export function BattleNetSignOut({ locale }: { locale: "en" | "ru" }) {
  return <BattleNetAction locale={locale} action="signout" />;
}
