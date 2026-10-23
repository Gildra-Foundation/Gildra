"use client";

import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "./valyro-ui/feedback/Toaster";
import { toast } from "./valyro-ui/feedback/toast-store";
import { AtlasValyroScope } from "./AtlasValyroScope";
import styles from "./AtlasToaster.module.css";

export type AtlasToastTone = "default" | "negative";

const closeLabel = { en: "Close notification", ru: "Закрыть уведомление" } as const;
let root: Root | null = null;

/** The page's one Valyro Toaster, rendered into its own root on the first toast. */
export function showAtlasToast(message: string, tone: AtlasToastTone, locale: "en" | "ru") {
  if (!root) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    root.render(
      <AtlasValyroScope locale={locale === "ru" ? "ru-RU" : "en-GB"}>
        <Toaster position="bottom-center" visibleToasts={2} closeLabel={closeLabel[locale]} className={styles.toaster} />
      </AtlasValyroScope>,
    );
  }
  (tone === "negative" ? toast.error : toast)(message, { duration: 2600 });
}
