import type { Metadata } from "next";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { TierSection } from "@/components/TierSection";
import { SectionNav } from "@/components/SectionNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Тир-лист Mythic+ — Gildra",
  description:
    "Полный тир-лист Mythic+ с фильтрами, чипами классов, избранными билдами и деталями спеков.",
  alternates: { languages: { en: "/tier-lists", ru: "/ru/tier-lists" } },
};

export default function TierListsPageRu() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <SectionNav />
          <div className="section route-section">
            <TierSection />
          </div>
        </main>
        <Footer lang="ru" />
      </div>
    </>
  );
}
