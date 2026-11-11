import type { Metadata } from "next";
import { QueldanasPage } from "@/components/wow/raid/QueldanasPage";
import { withPageOpenGraph } from "@/lib/seo/metadata";

// A route of its own rather than the [raid] route: one dynamic route for three raid
// pages shipped the client code of all three with each of them.
const path = "/ru/wow/raids/march-on-queldanas";
export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Марш на Кель’Данас: тактики боссов — WowArcana",
  description: "Бело’рен и Торжество Полуночи на обычной и героической сложности: порядок боя, позиционирование, прислужники и способности вашей специализации.",
  alternates: { canonical: path, languages: { en: "/wow/raids/march-on-queldanas", ru: "/ru/wow/raids/march-on-queldanas", "x-default": "/wow/raids/march-on-queldanas" } },
});

export default function Page() {
  return <QueldanasPage locale="ru" />;
}
