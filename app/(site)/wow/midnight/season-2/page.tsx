// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { SeasonTwoHub } from "@/components/wow/season2/SeasonTwoHub";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("season2", "en");

export default function Page() {
  return <SeasonTwoHub locale="en" />;
}
