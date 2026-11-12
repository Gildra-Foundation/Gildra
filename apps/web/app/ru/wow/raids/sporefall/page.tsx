import type { Metadata } from "next";
import { SporefallPage } from "@/components/wow/raid/SporefallPage";
import { withPageOpenGraph } from "@/lib/seo/metadata";

const path = "/ru/wow/raids/sporefall";
export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Споропад: Гнилотоп — тактика рейда — WowArcana",
  description: "Гнилотоп: понятная тактика обычного и героического Споропада. Позиции по ролям, прислужники, прерывания и способности вашего класса.",
  alternates: { canonical: path, languages: { en: "/wow/raids/sporefall", ru: path, "x-default": "/wow/raids/sporefall" } },
});
export default function Page() {
  return <SporefallPage locale="ru" />;
}
