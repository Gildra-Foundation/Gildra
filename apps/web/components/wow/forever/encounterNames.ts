import type { Lang } from "@/lib/i18n-paths";
import { instanceName } from "./instanceLocalization";

/** A boss's name as the page shows it: the guide's Russian name where it has one. */
export const bossName = (boss: { name: string; nameRu?: string }, lang: Lang) => lang === "ru" ? boss.nameRu ?? instanceName(boss.name, lang) : boss.name;
