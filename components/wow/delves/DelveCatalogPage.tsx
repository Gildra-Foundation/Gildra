import { Compass } from "lucide-react";
import { AtlasFrame, AtlasGrid, AtlasHero, AtlasSection, AtlasTile } from "@/components/atlas";
import { midnightDelves } from "@/data/wow/midnight-delves";

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", eyebrow: "Midnight", title: "Вылазки Midnight", lede: "Вылазки обоих сезонов Midnight. Тактика и награды появятся после проверки.", season2: "Сезон 2 · патч 12.1", season1: "Сезон 1 · патч 12.0", current: "Текущий сезон", delves: "вылазок" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", eyebrow: "Midnight", title: "Midnight Delves", lede: "Delves of both Midnight seasons. Strategy and rewards will appear once verified.", season2: "Season 2 · patch 12.1", season1: "Season 1 · patch 12.0", current: "Current season", delves: "delves" },
} as const;

export function DelveCatalogPage({ locale }: { locale: "en" | "ru" }) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const seasons = [
    { id: "midnight-season-2", title: text.season2, note: text.current },
    { id: "midnight-season-1", title: text.season1 },
  ] as const;
  return (
    <AtlasFrame lang={locale}>
      <AtlasHero
        breadcrumbs={[{ label: text.wow, href: `${prefix}/wow` }, { label: text.title }]}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={text.eyebrow}
        title={text.title}
        lede={text.lede}
        stats={[{ value: midnightDelves.length, label: text.delves }]}
      />
      {seasons.map((season) => {
        const delves = midnightDelves.filter((delve) => delve.season === season.id);
        return (
          <AtlasSection key={season.id} id={season.id} title={season.title} description={"note" in season ? season.note : undefined}>
            <AtlasGrid min={240} fit>
              {delves.map((delve) => <AtlasTile key={delve.id} href={`${prefix}/wow/delves/${delve.slug}`} icon={<Compass />} title={delve.name} />)}
            </AtlasGrid>
          </AtlasSection>
        );
      })}
    </AtlasFrame>
  );
}
