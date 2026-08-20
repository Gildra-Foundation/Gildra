import type { Metadata } from "next";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { TierSection } from "@/components/TierSection";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Mythic+ Tier List — Gildra",
  description:
    "Full Mythic+ tier list with filters, class chips, featured builds and spec details.",
};

export default function TierListsPage() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <div className="section route-section">
            <TierSection />
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
