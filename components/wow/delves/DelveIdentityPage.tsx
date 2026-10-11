import type { MidnightDelve } from "@/data/wow/midnight-delves";
import { IdentityStatusPage } from "@/components/wow/identity/IdentityStatusPage";

export function DelveIdentityPage({ delve, locale }: { delve: MidnightDelve; locale: "en" | "ru" }) {
  const seasonNumber = delve.season.endsWith("2") ? "2" : "1";
  return (
    <IdentityStatusPage
      locale={locale}
      eyebrow={locale === "ru" ? `Вылазка · Midnight · Сезон ${seasonNumber}` : `Delve · Midnight · Season ${seasonNumber}`}
      title={delve.name}
      summary={locale === "ru"
        ? "Вылазка подтверждена Blizzard. Тактика, способности и награды появятся здесь после проверки."
        : "The delve is confirmed by Blizzard. Strategy, abilities and rewards will appear here once verified."}
      patch={delve.patch}
      season={`Midnight Season ${seasonNumber}`}
      sourceUrl={delve.sourceUrl}
      sourceLabel={locale === "ru" ? "Анонс Blizzard" : "Blizzard announcement"}
      lastVerifiedAt={delve.lastVerifiedAt}
      parent={{ href: "/wow/delves", label: locale === "ru" ? "Вылазки" : "Delves" }}
    />
  );
}
