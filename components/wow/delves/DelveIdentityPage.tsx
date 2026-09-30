import Link from "next/link";
import type { MidnightDelve } from "@/data/wow/midnight-delves";

export function DelveIdentityPage({ delve, locale }: { delve: MidnightDelve; locale: "en" | "ru" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px 96px" }}>
      <nav aria-label={locale === "ru" ? "Хлебные крошки" : "Breadcrumbs"}>
        <Link href={`${prefix}/wow`}>World of Warcraft</Link> / <Link href={`${prefix}/wow/delves`}>Delves</Link>
      </nav>
      <p>Midnight · {delve.season.endsWith("2") ? "Season 2" : "Season 1"}</p>
      <h1>{delve.name}</h1>
      <p><strong>{locale === "ru" ? "Статус проверки:" : "Verification status:"}</strong> identity_only</p>
      <p>{locale === "ru"
        ? "Подтверждены название и принадлежность к сезону. Тактика, способности, игровые ID и добыча не опубликованы, пока не пройдут проверку."
        : "Name and season membership are verified. Strategy, abilities, game IDs, and loot are not published until verification is complete."}</p>
      <dl>
        <dt>Patch</dt><dd>{delve.patch}</dd>
        <dt>Build</dt><dd>{delve.build ?? (locale === "ru" ? "Не зафиксирован" : "Not recorded")}</dd>
        <dt>{locale === "ru" ? "Последняя проверка" : "Last verified"}</dt><dd>{delve.lastVerifiedAt}</dd>
      </dl>
      <p><a href={delve.sourceUrl} rel="noreferrer">{locale === "ru" ? "Официальный источник Blizzard" : "Official Blizzard source"}</a></p>
    </main>
  );
}
