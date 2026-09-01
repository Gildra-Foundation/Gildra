import Link from "next/link";

type Props = { lang: "en" | "ru"; href?: string };

export function LibraryUnavailable({ lang, href }: Props) {
  const next = href ?? (lang === "ru" ? "/ru/library" : "/library");
  return <section className="library-unavailable" role="alert">
    <p className="cap gold">{lang === "ru" ? "Каталог недоступен" : "Catalog unavailable"}</p>
    <h2>{lang === "ru" ? "Публикация данных временно закрыта" : "Data publication is temporarily closed"}</h2>
    <p>{lang === "ru" ? "Источники или API сейчас проходят проверку. Данные не удалены — повторите попытку позже или войдите в панель администратора." : "The sources or API are being checked. No data was deleted — try again later or sign in to the administrator console."}</p>
    <Link href={`/api-console?next=${encodeURIComponent(next)}`}>{lang === "ru" ? "Открыть панель" : "Open console"}</Link>
  </section>;
}
