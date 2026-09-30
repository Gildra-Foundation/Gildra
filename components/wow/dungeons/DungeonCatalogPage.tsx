import Link from "next/link";
import { dungeonRoutes } from "@/components/wow/mythic/dungeonRoutes";

export function DungeonCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px 96px" }}>
      <p>World of Warcraft · Midnight Season 2</p>
      <h1>{locale === "ru" ? "Подземелья" : "Dungeons"}</h1>
      <p>{locale === "ru"
        ? "Сезонная принадлежность подтверждена официальным обзором Blizzard. Маршруты остаются noindex до завершения проверки всех NPC, spell ID и иконок."
        : "Season membership is confirmed by Blizzard's official overview. Routes remain noindex until every NPC, spell ID, and icon is verified."}</p>
      <ul>
        {Object.values(dungeonRoutes).map((dungeon) => (
          <li key={dungeon.slug} style={{ marginBlock: 12 }}>
            <Link href={`${prefix}/wow/dungeons/${dungeon.slug}`}>{locale === "ru" ? dungeon.nameRu : dungeon.name}</Link>
          </li>
        ))}
      </ul>
      <p><a href="https://worldofwarcraft.blizzard.com/en-us/news/24280285" rel="noreferrer">{locale === "ru" ? "Официальный источник Blizzard" : "Official Blizzard source"}</a></p>
    </main>
  );
}
