import type { Lang } from "@/lib/i18n";
import { gameTextCopy } from "./gameTextCopy";

export function formatQuestText(text: string, lang: Lang) {
  return text.replaceAll(/\{name\}/gi, gameTextCopy[lang].adventurer);
}
