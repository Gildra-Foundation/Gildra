import { AtlasFrame, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import type { Locale } from "@/lib/data/gamecontent/types";

const copy = {
  ru: { title: "Данные временно недоступны", text: "Не удалось загрузить опубликованные данные. Попробуйте открыть страницу позже.", stale: "Показана последняя сохранённая версия", staleText: "Источник обновлений временно недоступен. Даты проверки данных сохранены." },
  en: { title: "Data is temporarily unavailable", text: "Published data could not be loaded. Please try opening this page later.", stale: "Showing the last saved version", staleText: "The update source is temporarily unavailable. Original verification dates are preserved." },
};

export function ContentUnavailable({ locale }: { locale: Locale }) {
  return <AtlasFrame lang={locale}><AtlasHero title={copy[locale].title} /><AtlasSection><AtlasNotice tone="caution">{copy[locale].text}</AtlasNotice></AtlasSection></AtlasFrame>;
}

export function ContentStatus({ locale, stale }: { locale: Locale; stale: boolean }) {
  return stale ? <div data-atlas-scope><AtlasNotice tone="caution" title={copy[locale].stale}>{copy[locale].staleText}</AtlasNotice></div> : null;
}
