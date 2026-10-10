import Link from "next/link";
import { AtlasDocument } from "@/components/layout/AtlasDocument";
import { midnightDelves } from "@/data/wow/midnight-delves";

export function DelveCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <AtlasDocument lang={locale}>
      <p>World of Warcraft · Midnight</p>
      <h1>{locale === "ru" ? "Вылазки Midnight" : "Midnight Delves"}</h1>
      <p>{locale === "ru"
        ? "Опубликованы только подтверждённые названия и сезонная принадлежность. Тактики появятся после проверки игровых ID и источников."
        : "Only verified names and season membership are published. Strategies remain withheld until game IDs and sources are verified."}</p>
      <ul>
        {midnightDelves.map((delve) => (
          <li key={delve.id}>
            <Link href={`${prefix}/wow/delves/${delve.slug}`}>{delve.name}</Link>
            {` · ${delve.season.replace("midnight-", "Midnight ").replaceAll("-", " ")} · ${delve.patch}`}
          </li>
        ))}
      </ul>
    </AtlasDocument>
  );
}
