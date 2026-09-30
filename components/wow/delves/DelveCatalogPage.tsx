import Link from "next/link";
import { midnightDelves } from "@/data/wow/midnight-delves";

export function DelveCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px 96px" }}>
      <p>World of Warcraft · Midnight</p>
      <h1>{locale === "ru" ? "Вылазки Midnight" : "Midnight Delves"}</h1>
      <p>{locale === "ru"
        ? "Опубликованы только подтверждённые названия и сезонная принадлежность. Тактики появятся после проверки игровых ID и источников."
        : "Only verified names and season membership are published. Strategies remain withheld until game IDs and sources are verified."}</p>
      <ul>
        {midnightDelves.map((delve) => (
          <li key={delve.id} style={{ marginBlock: 12 }}>
            <Link href={`${prefix}/wow/delves/${delve.slug}`}>{delve.name}</Link>
            {` · ${delve.season.replace("midnight-", "Midnight ").replaceAll("-", " ")} · ${delve.patch}`}
          </li>
        ))}
      </ul>
    </main>
  );
}
