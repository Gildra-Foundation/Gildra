import type { Metadata } from "next";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { TierSection } from "@/components/TierSection";
import { SectionNav } from "@/components/SectionNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Mythic+ Tier List — Gildra",
  description:
    "Full Mythic+ tier list with filters, class chips, featured builds and spec details.",
  alternates: { languages: { en: "/tier-lists", ru: "/ru/tier-lists" } },
};

export default function TierListsPage() {
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
        <Footer />
      </div>
    </>
  );
}
