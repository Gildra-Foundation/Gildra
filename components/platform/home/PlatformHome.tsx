import type { Lang } from "@/lib/i18n";
import { GrimoireHome } from "./GrimoireHome";
export function PlatformHome({ lang }: { lang: Lang }) {
  return <GrimoireHome lang={lang} />;
}
