"use client";

import { Share2 } from "lucide-react";
import { AtlasButton } from "./AtlasButton";
import { copyText } from "./clipboard";
import { notify } from "./toast";

const copy = {
  en: { share: "Share", copied: "Link copied", failed: "Could not copy the link" },
  ru: { share: "Поделиться", copied: "Ссылка скопирована", failed: "Не удалось скопировать ссылку" },
} as const;

/**
 * "Share" for entity pages (bosses, lairs, database entries): the system share
 * sheet on touch devices, otherwise the page link goes to the clipboard and a
 * Valyro toast confirms it. Shares the canonical URL without the hash.
 */
export function AtlasShareButton({ title, locale }: { title: string; locale: "en" | "ru" }) {
  const t = copy[locale];
  async function share() {
    const url = `${location.origin}${location.pathname}${location.search}`;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
      }
    }
    try {
      await copyText(url);
      notify(t.copied, { locale });
    } catch {
      notify(t.failed, { tone: "negative", locale });
    }
  }

  return <AtlasButton variant="ghost" icon={<Share2 aria-hidden="true" />} onClick={share}>{t.share}</AtlasButton>;
}
