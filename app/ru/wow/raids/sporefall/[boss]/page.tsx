import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

const path = "/ru/wow/raids/sporefall/rotmire";
export const metadata: Metadata = {
  title: "Rotmire — Sporefall — Gildra",
  description: "Страница подтверждённой идентичности Rotmire в Sporefall. Тактика, abilities, ID, иконки и loot ожидают проверки.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall/rotmire", ru: path, "x-default": "/wow/raids/sporefall/rotmire" } },
  robots: { index: false, follow: true },
};
export function generateStaticParams() { return [{ boss: "rotmire" }]; }
export default async function Page({ params }: { params: Promise<{ boss: string }> }) {
  if ((await params).boss !== "rotmire") notFound();
  return <IdentityStatusPage locale="ru" eyebrow="Sporefall · встреча" title="Rotmire" summary="Идентичность встречи подтверждена Blizzard. Утверждения о тактике, способностях, игровых ID, иконках и добыче ещё не публикуются." patch="12.0.7" season="Midnight Season 1" sourceUrl="https://worldofwarcraft.blizzard.com/en-us/news/24272110" sourceLabel="Официальный источник Blizzard" lastVerifiedAt="2026-09-13" />;
}
