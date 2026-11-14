import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { footerCopy } from "@/components/atlas/footerLinks";
import { atlasLegal } from "@/components/atlas/AtlasFrame";
import { FooterLanguage } from "@/components/atlas/FooterLanguage";
import { NotFoundActions, NotFoundFooterLanguage, NotFoundFooterLinks, NotFoundLede, NotFoundMotionToggle, NotFoundText, NotFoundTitle } from "./NotFoundCopy";
import { materialButtonStyle } from "@/components/wow/shared/material/materialKit";
import { LazyNotFoundSuggestions } from "./LazyNotFoundSuggestions";

export const notFoundMetadata: Metadata = {
  title: "404 — WowArcana",
  robots: { index: false, follow: true },
};

/** 404 on the atlas kit. `locale` is known inside a language tree; without it
 *  (unmatched URLs) the language comes from the URL (see NotFoundCopy). */
export function NotFoundPage({ locale }: { locale?: "en" | "ru" }) {
  return (
    // The 404 of unmatched URLs learns its language only from the URL after hydration: its legal line carries both.
    <AtlasFrame lang={locale} scene="lost" footer={locale ? { language: <FooterLanguage locale={locale} missing /> } : {
      legal: <NotFoundText en={atlasLegal("en")} ru={atlasLegal("ru")} />,
      description: <NotFoundText en={footerCopy.en.description} ru={footerCopy.ru.description} />,
      language: <NotFoundFooterLanguage />,
      links: <NotFoundFooterLinks />,
      motion: <NotFoundMotionToggle />,
    }}>
      <AtlasHero
        eyebrow="404"
        title={<NotFoundTitle locale={locale} />}
        lede={<NotFoundLede locale={locale} />}
        actions={<NotFoundActions locale={locale} slotStyle={materialButtonStyle("den-of-nalorakk")} />}
      />
      <LazyNotFoundSuggestions />
    </AtlasFrame>
  );
}
