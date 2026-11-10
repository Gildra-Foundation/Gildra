import type { Lang } from "@/lib/i18n-paths";
import { HallGuideClient } from "./HallGuideClient";
import { InstanceLoot } from "./InstanceLoot";

export function HallGuide({ lang }: { lang: Lang }) {
  return <HallGuideClient lang={lang} loot={<InstanceLoot slug="hall-of-thanes" lang={lang} />} />;
}
