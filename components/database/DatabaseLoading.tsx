import { Footer } from "@/components/Footer";
import { Icons } from "@/components/Icons";
import { TopNav } from "@/components/TopNav";
import type { Lang } from "@/lib/i18n";

export function DatabaseLoading({ lang }: { lang: Lang }) {
  return <>
    <Icons />
    <TopNav />
    <div className="app">
      <main className="main"><div className="section route-section"><div className="db-loading" role="status" aria-live="polite"><div><span className="db-skeleton db-skeleton-cap" /><span className="db-skeleton db-skeleton-title" /><span className="db-skeleton db-skeleton-copy" /></div><span className="db-skeleton db-skeleton-search" /><div className="db-skeleton-chips">{Array.from({ length: 8 }, (_, index) => <span className="db-skeleton" key={index} />)}</div><div className="db-skeleton-records">{Array.from({ length: 8 }, (_, index) => <span className="db-skeleton" key={index} />)}</div><span className="sr-only">{lang === "ru" ? "Загрузка базы данных" : "Loading database"}</span></div></div></main>
      <Footer lang={lang} />
    </div>
  </>;
}
