import type { Metadata } from "next";
import { WhatsNewPage } from "@/components/wow/whats-new";

export const metadata: Metadata = {
  title: "Что нового — Gildra",
  alternates: { canonical: "/ru/wow/whats-new", languages: { en: "/wow/whats-new", ru: "/ru/wow/whats-new" } },
  robots: { index: false, follow: true },
};
export default function Page() { return <WhatsNewPage locale="ru" />; }
