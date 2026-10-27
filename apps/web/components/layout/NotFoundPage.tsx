import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { atlasLegal } from "@/components/atlas/AtlasFrame";
import { t } from "@/lib/i18n";
import { NotFoundActions, NotFoundFooterLinks, NotFoundLede, NotFoundText, NotFoundTitle } from "./NotFoundCopy";
import { NotFoundSuggestions } from "./NotFoundSuggestions";

export const notFoundMetadata: Metadata = {
  title: "404 — Gildra",
  robots: { index: false, follow: true },
};

/** 404 on the atlas kit. `locale` is known inside a language tree; without it
 *  (unmatched URLs) the language comes from the URL (see NotFoundCopy). */
export function NotFoundPage({ locale }: { locale?: "en" | "ru" }) {
  return (
    // The 404 of unmatched URLs learns its language only from the URL after hydration: its legal line carries both.
    <AtlasFrame lang={locale} scene="lost" footer={locale ? true : {
      legal: <NotFoundText en={atlasLegal("en")} ru={atlasLegal("ru")} />,
      links: <NotFoundFooterLinks whatsNew={{ en: t("en")("What's new"), ru: t("ru")("What's new") }} privacy={{ en: t("en")("Privacy Policy"), ru: t("ru")("Privacy Policy") }} />,
    }}>
      <AtlasHero
        eyebrow="404"
        title={<NotFoundTitle locale={locale} />}
        lede={<NotFoundLede locale={locale} />}
        actions={<NotFoundActions locale={locale} />}
      />
      <NotFoundSuggestions />
    </AtlasFrame>
  );
}
