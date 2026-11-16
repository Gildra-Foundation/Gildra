"use client";
import { useState } from "react";
import { GearFarmPlanner } from "@/components/wow/audit/GearFarmPlanner";
export function FarmPanels({ locale }: { locale: "ru" | "en" }) {
  const [profileKey, setProfileKey] = useState("synthetic-farm");
  return <><button type="button" onClick={() => setProfileKey("synthetic-profile-changed")}>Change synthetic profile</button><GearFarmPlanner characterSlug="eu--synthetic-farm--synthetic" snapshotKey={profileKey} localePrefix={locale === "ru" ? "/ru" : ""} /></>;
}
