import type { Lang } from "@/lib/i18n";

export function formatQuestText(text: string, lang: Lang) {
  return text.replaceAll(/\{name\}/gi, lang === "ru" ? "герой" : "adventurer");
}
