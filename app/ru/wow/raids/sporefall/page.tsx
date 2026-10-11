import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";

const path = "/ru/wow/raids/sporefall";
export const metadata: Metadata = {
  title: "Sporefall — рейд Midnight — Gildra",
  description: "Страница подтверждённой идентичности рейда Sporefall и встречи Rotmire. Тактика и сущности скрыты до проверки.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
  robots: { index: false, follow: true },
};
export default function Page() {
  return <SporefallPage locale="ru" view="raid" />;
}
