"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/i18n";

export function DatabaseError({ error, reset, lang }: { error: Error & { digest?: string }; reset: () => void; lang: Lang }) {
  useEffect(() => { console.error(error); }, [error]);
  const prefix = lang === "ru" ? "/ru" : "";
  return <main className="db-error-page"><div className="db-error-plate"><p className="cap gold">{lang === "ru" ? "База данных недоступна" : "Database unavailable"}</p><h1>{lang === "ru" ? "Не удалось загрузить каталог" : "The catalog could not be loaded"}</h1><p>{lang === "ru" ? "API или проекция данных временно не ответили. Повторите запрос; ваши фильтры не изменятся." : "The API or data projection did not respond. Retry the request; your filters will stay intact."}</p><div><button type="button" onClick={reset}>{lang === "ru" ? "Повторить" : "Try again"}</button><Link href={`${prefix}/database`}>{lang === "ru" ? "Сбросить фильтры" : "Reset filters"}</Link></div></div></main>;
}
