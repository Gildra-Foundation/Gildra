import type { Lang } from "@/lib/i18n";
import type { BattleNetCharacterDetails } from "@/lib/wow/battleNetCharacterDetails";
import { toCharacterAuditSnapshot } from "@/lib/wow/battleNetAuditSnapshot";
import details from "./zulut-details.json";

/**
 * Development-only snapshot of a real character (Nightborne female priest, EU Ashenvale) built from its public
 * Battle.net answers through the same mapping as the live page. The 3D equipment is already resolved, so the
 * viewer does not call the signed-in model route.
 */
export function zulutFixture(lang: Lang) {
  const snapshot = toCharacterAuditSnapshot({ ...(details as unknown as BattleNetCharacterDetails), recommendations: [] }, lang);
  return { ...snapshot, slug: "zulut", appearance: { ...snapshot.appearance, presetId: "dev-zulut" } };
}
