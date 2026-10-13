import type { MidnightDelve } from "@/lib/data/wow";
import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";
import { delveIdentityPageCopy } from "./delveIdentityPageCopy";

export function DelveIdentityPage({ delve, locale }: { delve: MidnightDelve; locale: "en" | "ru" }) {
  const seasonNumber = delve.season.endsWith("2") ? "2" : "1";
  return (
    <IdentityStatusPage
      art="/assets/wow/loading/dungeon.webp"
      artPosition="center 45%"
      locale={locale}
      eyebrow={locale === "ru" ? `Вылазка · Midnight · Сезон ${seasonNumber}` : `Delve · Midnight · Season ${seasonNumber}`}
      title={delve.name}
      summary={delveIdentityPageCopy[locale].theDelveIsConfirmed}
      patch={delve.patch}
      season={`Midnight Season ${seasonNumber}`}
      sourceUrl={delve.sourceUrl}
      sourceLabel={delveIdentityPageCopy[locale].blizzardAnnouncement}
      lastVerifiedAt={delve.lastVerifiedAt}
      parent={{ href: "/wow/delves", label: delveIdentityPageCopy[locale].delves }}
    />
  );
}
