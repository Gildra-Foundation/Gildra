import type { Metadata } from "next";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { NotFoundActions, NotFoundLede, NotFoundTitle } from "./NotFoundCopy";
import { NotFoundSuggestions } from "./NotFoundSuggestions";

export const notFoundMetadata: Metadata = {
  title: "404 — Gildra",
  robots: { index: false, follow: true },
};

/** 404 on the atlas kit. `locale` is known inside a language tree; without it
 *  (unmatched URLs) the language comes from the URL (see NotFoundCopy). */
export function NotFoundPage({ locale }: { locale?: "en" | "ru" }) {
  return (
    <AtlasFrame footer={false} scene="lost">
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
