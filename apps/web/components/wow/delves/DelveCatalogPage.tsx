import Link from "next/link";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { midnightDelves } from "@/lib/data/wow";
import styles from "./delveCatalog.module.css";
import { trail } from "@/lib/routes/registry";

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", title: "Вылазки Midnight", lede: "Вылазки обоих сезонов Midnight. Тактика и награды появятся после проверки.", season2: "Сезон 2 · патч 12.1", season1: "Сезон 1 · патч 12.0", current: "Текущий сезон", delves: "вылазок" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", title: "Midnight Delves", lede: "Delves of both Midnight seasons. Strategy and rewards will appear once verified.", season2: "Season 2 · patch 12.1", season1: "Season 1 · patch 12.0", current: "Current season", delves: "delves" },
} as const;

export function DelveCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const seasons = [
    { id: "midnight-season-2", title: text.season2, note: text.current },
    { id: "midnight-season-1", title: text.season1 },
  ] as const;
  return (
    <AtlasFrame lang={locale} scene="delves">
      <AtlasHero
        breadcrumbs={trail(locale, "delves")}
        breadcrumbsLabel={text.breadcrumbs}
        title={text.title}
        lede={text.lede}
        stats={[{ value: midnightDelves.length, label: text.delves }]}
      />
      {/* An atlas index: names on dotted leaders, the current season set larger. */}
      {seasons.map((season) => {
        const delves = midnightDelves.filter((delve) => delve.season === season.id);
        const current = "note" in season;
        return (
          <AtlasSection key={season.id} id={season.id} title={season.title} description={current ? season.note : undefined}>
            <ol className={clsx(styles.index, current && styles.current)}>
              {delves.map((delve) => (
                <li key={delve.id}>
                  <Link className={styles.entry} href={`${prefix}/wow/delves/${delve.slug}`}>
                    <span className={styles.name}>{delve.name}</span>
                    <span className={styles.leader} aria-hidden="true" />
                    <ArrowRight className={styles.arrow} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </AtlasSection>
        );
      })}
    </AtlasFrame>
  );
}
