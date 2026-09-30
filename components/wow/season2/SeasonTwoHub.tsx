import { IdentityStatusPage } from "../identity/IdentityStatusPage";

type Locale = "ru" | "en";

const OFFICIAL_SEASON_SOURCE = "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live";

export function SeasonTwoHub({ locale }: { locale: Locale }) {
  const ru = locale === "ru";
  return (
    <IdentityStatusPage
      locale={locale}
      eyebrow="World of Warcraft · Midnight"
      title="Midnight Season 2"
      summary={ru
        ? "Официальный обзор подтверждает запуск Season 2 и его основные семейства активностей. Таблицы наград, уровни предметов, игровые ID и детальные расписания скрыты до построчной сверки с каноническим manifest."
        : "Blizzard's official overview confirms the Season 2 launch and its main activity families. Reward tables, item levels, game IDs, and detailed schedules are withheld until row-level reconciliation with the canonical manifest."}
      patch="12.1"
      season="Midnight Season 2"
      sourceUrl={OFFICIAL_SEASON_SOURCE}
      sourceLabel={ru ? "Официальный обзор Blizzard" : "Official Blizzard overview"}
      lastVerifiedAt="2026-09-13"
      links={[
        { href: "/wow/raids/venomous-abyss", label: "The Venomous Abyss" },
        { href: "/wow/mythic-plus/seasons/midnight-season-2", label: "Mythic+ Season 2" },
        { href: "/wow/delves", label: "Delves" },
        { href: "/wow/prey", label: "Prey" },
        { href: "/wow/lairs", label: "Lairs" },
      ]}
    />
  );
}
