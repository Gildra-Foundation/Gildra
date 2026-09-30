"use client";

import { useEffect, useState } from "react";
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
    <main lang={locale} aria-busy="true" style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, color: "#e8dcc7", background: "#081014" }}>
      <p role="status">{locale === "ru" ? "Загружаем персонажей Battle.net…" : "Loading your Battle.net characters…"}</p>
    </main>
  );
}
