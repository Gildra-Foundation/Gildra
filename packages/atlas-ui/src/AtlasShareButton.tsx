"use client";

import { useCallback, useState } from "react";
import { Share2 } from "lucide-react";
import { AtlasButton } from "./AtlasButton";
import { AtlasToast } from "./AtlasToast";
import { copyText } from "./clipboard";

const copy = {
  en: { share: "Share", copied: "Link copied", failed: "Could not copy the link" },
  ru: { share: "Поделиться", copied: "Ссылка скопирована", failed: "Не удалось скопировать ссылку" },
} as const;

/**
 * "Share" for entity pages (bosses, lairs, database entries): the system share
 * sheet on touch devices, otherwise the page link goes to the clipboard and a
 * toast confirms it. Shares the canonical URL without the hash.
 */
export function AtlasShareButton({ title, locale }: { title: string; locale: "en" | "ru" }) {
  const t = copy[locale];
  const [toast, setToast] = useState<{ text: string; tone: "default" | "negative" } | null>(null);
  const hide = useCallback(() => setToast(null), []);

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
      setToast({ text: t.copied, tone: "default" });
    } catch {
      setToast({ text: t.failed, tone: "negative" });
    }
  }

  return <>
    <AtlasButton variant="ghost" icon={<Share2 aria-hidden="true" />} onClick={share}>{t.share}</AtlasButton>
    <AtlasToast message={toast?.text ?? null} tone={toast?.tone} onDone={hide} />
  </>;
}
