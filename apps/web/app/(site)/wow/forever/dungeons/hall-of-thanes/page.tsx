// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { HallGuide } from "@/components/wow/forever/HallGuide";
import { foreverDungeonMetadata } from "@/lib/seo/foreverDungeonMetadata";
const lang = "en";
export const metadata = foreverDungeonMetadata(lang, "hall-of-thanes");
export default function Page() { return <HallGuide lang={lang} />; }
