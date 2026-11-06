import type { Metadata } from "next";
import { KithixPage } from "@/components/wow/raid/KithixPage";
import { kithixRaid } from "@/components/wow/raid/kithixRaidData";
import { withPageOpenGraph } from "@/lib/seo/metadata";

const path = "/wow/raids/the-unbinding-of-kithix";
export const metadata: Metadata = withPageOpenGraph("ru", {
  title: `${kithixRaid.names.ru} — Gildra`,
  description: kithixRaid.descriptions.ru,
  alternates: { canonical: `/ru${path}`, languages: { en: path, ru: `/ru${path}`, "x-default": path } },
});
export default function Page() {
  return <KithixPage locale="ru" />;
}
