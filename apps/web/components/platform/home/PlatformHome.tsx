import type { Lang } from "@/lib/i18n";
import { AtlasHome } from "./AtlasHome";
export function PlatformHome({ lang }: { lang: Lang }) {
  // GrimoireHome and the complete book experience remain in the repository,
  // but are not imported or mounted by the active site.
  return <AtlasHome lang={lang} />;
}
