import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { dungeonRoutes, type DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonArtDirections, dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import styles from "./wowHome.module.css";

/** The season's dungeons as painted doors: each card is the dungeon's own scene, accent and timer. */
export function HomeDungeons({ locale, season, slugs, label }: { locale: "en" | "ru"; season: string; slugs: readonly DungeonSlug[]; label: string }) {
  const prefix = locale === "ru" ? "/ru" : "";
  return <nav className={styles.dungeons} aria-label={label}><ul>{slugs.map(slug => {
    const route = dungeonRoutes[slug];
    return <li key={slug} style={{ "--dungeon-accent": dungeonArtDirections[slug].accent } as CSSProperties}>
      <Link href={`${prefix}/wow/mythic-plus/${season}/${slug}`} prefetch={false}>
        <Image src={dungeonBackdropSmall(slug)} alt="" width={768} height={576} sizes="(max-width: 700px) 70vw, 300px" quality={55} loading="lazy" decoding="async" />
        <span className={styles.dungeonName}>{locale === "ru" ? route.nameRu : route.name}</span>
        <span className={styles.timer}>{Math.floor(route.timerSeconds / 60)}:00</span>
      </Link>
    </li>;
  })}</ul></nav>;
}
