import type { Metadata } from "next";
import { DreamriftPage } from "@/components/wow/raid/DreamriftPage";
import { withPageOpenGraph } from "@/lib/seo/metadata";

// A route of its own rather than the [raid] route: one dynamic route for three raid
// pages shipped the client code of all three with each of them.
const path = "/ru/wow/raids/the-dreamrift";
export const metadata: Metadata = withPageOpenGraph("ru", {
  title: "Провал снов: гайд по Химерию — Gildra",
  description: "Химерий на обычной и героической сложности: смена миров и групп, позиционирование, прислужники и способности вашей специализации.",
  alternates: { canonical: path, languages: { en: "/wow/raids/the-dreamrift", ru: "/ru/wow/raids/the-dreamrift", "x-default": "/wow/raids/the-dreamrift" } },
});

export default function Page() {
  return <DreamriftPage locale="ru" />;
}
