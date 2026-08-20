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

export default function Home() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <Hero />
          <SectionNav />
          <div className="section">
            <section id="meta" className="cards-row">
              <MythicMeta />
              <MetaTrends />
            </section>
            <RaidFeature />
            <section id="guides" className="guides-sec">
              <GuidesSection />
            </section>
            <section id="tier-list-preview" className="tpv">
              <TierPreview />
            </section>
          </div>
        </main>
        <Footer />
      </div>
      <Reveal />
    </>
  );
}
