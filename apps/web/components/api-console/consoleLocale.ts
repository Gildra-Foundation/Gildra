"use client";
import { usePathname } from "next/navigation";
import { langOf } from "@/lib/i18n-paths";
import { consoleEnglish } from "./consoleCopy";

export function consoleText(text: string, lang: "en" | "ru") {
  if (lang === "ru") return text;
  const key = text.trim();
  const translated = consoleEnglish[key];
  if (!translated) return text;
  return text.replace(key, translated);
}
export function useConsoleText() {
  const lang = langOf(usePathname());
  return (text: string) => consoleText(text, lang);
}
