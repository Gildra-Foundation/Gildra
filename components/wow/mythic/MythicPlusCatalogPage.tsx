import Link from "next/link";
import { dungeonRoutes } from "./dungeonRoutes";

export function MythicPlusCatalogPage({ locale, season = "midnight-season-2" }: { locale: "en" | "ru"; season?: "midnight-season-1" | "midnight-season-2" }) {
  const prefix = locale === "ru" ? "/ru" : "";
  const isCurrent = season === "midnight-season-2";
  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 24px 96px" }}>
      <p>World of Warcraft · Midnight</p>
      <h1>{locale === "ru" ? `Mythic+ · сезон ${isCurrent ? "2" : "1"}` : `Mythic+ · Season ${isCurrent ? "2" : "1"}`}</h1>
      <p>{isCurrent
        ? (locale === "ru" ? "Пул подземелий подтверждён официальным обзором Blizzard." : "The dungeon pool is confirmed by Blizzard's official overview.")
        : (locale === "ru" ? "Исторический пул не публикуется, пока его состав не пройдёт сверку по источникам." : "The historical pool is withheld until its membership is source-verified.")}</p>
      {isCurrent ? <ul>{Object.values(dungeonRoutes).map((dungeon) => (
        <li key={dungeon.slug} style={{ marginBlock: 12 }}>
          <Link href={`${prefix}/wow/mythic-plus/${season}/${dungeon.slug}`}>{locale === "ru" ? dungeon.nameRu : dungeon.name}</Link>
        </li>
      ))}</ul> : null}
      <nav aria-label={locale === "ru" ? "Сезоны Mythic+" : "Mythic+ seasons"}>
        <Link href={`${prefix}/wow/mythic-plus/seasons/midnight-season-1`}>Midnight Season 1</Link>{" · "}
        <Link href={`${prefix}/wow/mythic-plus/seasons/midnight-season-2`}>Midnight Season 2</Link>
      </nav>
      <p><a href={isCurrent ? "https://worldofwarcraft.blizzard.com/en-us/news/24280285" : "https://worldofwarcraft.blizzard.com/en-us/news/24266321/midnight-season-1-has-begun"} rel="noreferrer">{locale === "ru" ? "Официальный источник Blizzard" : "Official Blizzard source"}</a></p>
    </main>
  );
}
