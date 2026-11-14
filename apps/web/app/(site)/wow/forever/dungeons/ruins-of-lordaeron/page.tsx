// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { ForeverDungeonGuide } from "@/components/wow/forever/ForeverDungeonGuide";
import { foreverDungeonMetadata } from "@/lib/seo/foreverDungeonMetadata";
const lang = "en";
export const metadata = foreverDungeonMetadata(lang, "ruins-of-lordaeron");
export default function Page() { return <ForeverDungeonGuide lang={lang} slug="ruins-of-lordaeron" />; }
