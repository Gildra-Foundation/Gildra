import { PageShell } from "@/components/layout/PageShell";
import type { Lang } from "@/lib/i18n";

export function DatabaseLoading({ lang }: { lang: Lang }) {
  return <PageShell lang={lang} variant="route"><div className="db-loading" role="status" aria-live="polite"><div><span className="db-skeleton db-skeleton-cap" /><span className="db-skeleton db-skeleton-title" /><span className="db-skeleton db-skeleton-copy" /></div><span className="db-skeleton db-skeleton-search" /><div className="db-skeleton-chips">{Array.from({ length: 8 }, (_, index) => <span className="db-skeleton" key={index} />)}</div><div className="db-skeleton-records">{Array.from({ length: 8 }, (_, index) => <span className="db-skeleton" key={index} />)}</div><span className="sr-only">{lang === "ru" ? "Загрузка базы данных" : "Loading database"}</span></div></PageShell>;
}
