"use client";

import { useEffect, useState } from "react";
import { CharacterAtlasShell, CharacterAtlasHeader } from "./CharacterAtlasShell";
import styles from "./characterRosterPage.module.css";
import type { BattleNetRegion } from "@/lib/wow/battleNetCharacters";

type CharacterRosterPageComponent = typeof import("./CharacterRosterPage").CharacterRosterPage;

export function ConnectedCharacterRosterLoader({ locale, accountName, pendingRegions }: {
  locale: "en" | "ru";
  accountName?: string;
  pendingRegions: BattleNetRegion[];
}) {
  const [RosterPage, setRosterPage] = useState<CharacterRosterPageComponent | null>(null);

  useEffect(() => {
    let active = true;
    void import("./CharacterRosterPage").then((module) => {
      if (active) setRosterPage(() => module.CharacterRosterPage);
    });
    return () => { active = false; };
  }, []);

  if (RosterPage) {
    return <RosterPage characters={[]} locale={locale} isConnected accountName={accountName} pendingRegions={pendingRegions} />;
  }

  return (
    <CharacterAtlasShell locale={locale} view="loading">
      <CharacterAtlasHeader title={locale === "ru" ? "Персонажи аккаунта" : "Account characters"} intro={locale === "ru" ? "Загружаем персонажей из официального профиля Battle.net." : "Loading characters from your official Battle.net profile."} eyebrow="Battle.net" />
      <div className={styles.loading} aria-busy="true"><p role="status">{locale === "ru" ? "Загружаем персонажей Battle.net…" : "Loading your Battle.net characters…"}</p></div>
    </CharacterAtlasShell>
  );
}
