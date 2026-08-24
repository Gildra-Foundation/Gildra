import type { Metadata } from "next";
import Link from "next/link";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Gildra",
  description:
    "What Gildra stores in your browser and which data the site collects.",
};

export default function PrivacyPage() {
  return (
    <>
      <Icons />
      <TopNav />
      <div className="app">
        <main className="main">
          <div className="section route-section legal">
            <h1>Privacy Policy</h1>
            <p className="legal-upd">Last updated: August 20, 2026</p>

            <h2>What we store in your browser</h2>
            <p>
              Gildra keeps a small amount of data in your browser&rsquo;s local
              storage: interface preferences and your cookie choice itself.
              This data never leaves your device and is not shared with anyone.
            </p>

            <h2>What we collect</h2>
            <p>
              The site is hosted on Vercel, which records standard anonymous
              request logs (IP address, browser type, requested page) to serve
              and protect the site. Gildra may also collect anonymous,
              aggregated usage statistics — page views and general performance
              metrics. None of this identifies you personally.
            </p>

            <h2>What we do not do</h2>
            <p>
              Gildra does not run advertising trackers, does not sell or share
              data with third parties, and does not require an account. If you
              decline cookies, only the technically necessary storage described
              above is used.
            </p>

            <h2>Contact</h2>
            <p>
              Questions about this policy — open an issue in the project
              repository or reach out to the team.
            </p>

            <p className="legal-back">
              <Link className="btn-line" href="/">
                ← Back to Gildra
              </Link>
            </p>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
