import type { Metadata } from "next";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { Hero } from "@/components/Hero";
import { MythicMeta } from "@/components/MythicMeta";
import { MetaTrends } from "@/components/MetaTrends";
import { RaidFeature } from "@/components/RaidFeature";
import { GuidesSection } from "@/components/GuidesSection";
import { TierPreview } from "@/components/TierPreview";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import { SectionNav } from "@/components/SectionNav";
import { MetaPulse } from "@/components/MetaPulse";
import { AdSlot } from "@/components/AdSlot";

export const metadata: Metadata = {
  title: "Gildra — Владей метой",
  description:
    "Живые тир-листы World of Warcraft, статистика меты Mythic+ и рейдов, билды и гайды.",
  alternates: { languages: { en: "/", ru: "/ru" } },
};

export default function HomeRu() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <Hero lang="ru" />
          <SectionNav />
          <div className="section">
            <MetaPulse lang="ru" />
            <section id="meta" className="cards-row">
              <MythicMeta lang="ru" />
              <MetaTrends lang="ru" />
            </section>
            <AdSlot lang="ru" />
            <RaidFeature lang="ru" />
            <section id="guides" className="guides-sec">
              <GuidesSection lang="ru" />
            </section>
            <section id="tier-list-preview" className="tpv">
              <TierPreview lang="ru" />
            </section>
          </div>
        </main>
        <Footer lang="ru" />
      </div>
      <Reveal />
    </>
  );
}
