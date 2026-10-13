// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { WowHome } from "@/components/wow/home/WowHome";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("wow", "en");

export default function Page() {
  return <WowHome lang="en" />;
}
