import type { Lang } from "@/lib/i18n-paths";
import { fullWowNameTable } from "./fullWowNameTable";
import { routeText } from "./wowNameTable";

/** Display-only route prose: keep English keys, IDs, saved routes and calculations intact. */
export const wowRouteText = (value: string, lang: Lang) => routeText(fullWowNameTable, value, lang);
