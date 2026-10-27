// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import type { Metadata } from "next";
import { SeasonTwoHub } from "@/components/wow/mythic/SeasonTwoHub";
import { seasonTwoHubCopy } from "@/components/wow/mythic/seasonTwoHubCopy";
import { sectionMetadata } from "@/lib/routes/metadata";

const base = sectionMetadata("season2", "en"), description = seasonTwoHubCopy["en"].metaDescription;
export const metadata: Metadata = { ...base, description, openGraph: { ...base.openGraph, description } };

export default function Page() {
  return <SeasonTwoHub locale="en" />;
}
