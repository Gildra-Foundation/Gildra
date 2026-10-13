// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { RaidAtlasPage } from "@/components/wow/raid/RaidAtlasPage";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("raids", "en");

export default function RaidsPage() {
  return <RaidAtlasPage locale="en" />;
}
