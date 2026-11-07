// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { WorldMapPage, worldMapMetadata } from "@/components/wow/worldMap/WorldMapPage";

export const metadata = worldMapMetadata("en", null);

export default function WorldMapRoute() {
  return <WorldMapPage lang="en" />;
}
