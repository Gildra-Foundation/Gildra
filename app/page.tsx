import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { Hero } from "@/components/Hero";
import { MythicMeta } from "@/components/MythicMeta";
import { MetaTrends } from "@/components/MetaTrends";
import { RaidFeature } from "@/components/RaidFeature";
import { GuidesSection } from "@/components/GuidesSection";
import { TierSection } from "@/components/TierSection";
import { Footer } from "@/components/Footer";
import { Reveal } from "@/components/Reveal";

export default function Home() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <Hero />
          <div className="section">
            <div className="cards-row">
              <MythicMeta />
              <MetaTrends />
            </div>
            <RaidFeature />
            <GuidesSection />
            <TierSection />
          </div>
        </main>
        <Footer />
      </div>
      <Reveal />
    </>
  );
}
