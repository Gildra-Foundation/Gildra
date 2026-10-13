import type { Metadata } from "next";
import { WhatsNewPage } from "@/components/wow/whats-new";

export const metadata: Metadata = {
  title: "What's new — Gildra",
  alternates: { canonical: "/wow/whats-new", languages: { en: "/wow/whats-new", ru: "/ru/wow/whats-new" } },
  robots: { index: false, follow: true },
};
export default function Page() { return <WhatsNewPage locale="en" />; }
