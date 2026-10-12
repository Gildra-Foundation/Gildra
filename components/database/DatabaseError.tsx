"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { AtlasButton, AtlasLinkButton } from "@/components/atlas/AtlasButton";
import { AtlasError } from "@/components/atlas/AtlasState";
import type { Lang } from "@/lib/i18n";
import styles from "./databaseError.module.css";

const copy = {
  ru: { title: "Не удалось загрузить каталог", text: "API или проекция данных временно не ответили. Повторите запрос — ваши фильтры не изменятся.", retry: "Повторить", reset: "Сбросить фильтры" },
  en: { title: "The catalog could not be loaded", text: "The API or data projection did not respond. Retry the request — your filters stay intact.", retry: "Try again", reset: "Reset filters" },
} as const;

/** Error boundary of /database (client: error.tsx). Atlas error state without the server-only frame. */
export function DatabaseError({ error, reset, lang }: { error: Error & { digest?: string }; reset: () => void; lang: Lang }) {
  useEffect(() => { console.error(error); }, [error]);
  const text = copy[lang === "ru" ? "ru" : "en"];
  return (
    <main className={styles.page} lang={lang}>
      <AtlasError
        title={text.title}
        code={error.digest}
        actions={<>
          <AtlasButton variant="primary" icon={<RotateCcw aria-hidden="true" />} onClick={reset}>{text.retry}</AtlasButton>
          <AtlasLinkButton href={lang === "ru" ? "/ru/database" : "/database"} variant="ghost">{text.reset}</AtlasLinkButton>
        </>}
      >
        {text.text}
      </AtlasError>
    </main>
  );
}
