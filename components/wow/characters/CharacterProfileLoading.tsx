import { LoaderCircle } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { characterCopy, characterCrumbs } from "./characterCopy";

/** Shown while Battle.net returns the requested character; no client JS. */
export function CharacterProfileLoading({ locale }: { locale: "en" | "ru" }) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "loading" }}>
      <div role="status" aria-busy="true">
        <AtlasHero
          breadcrumbs={characterCrumbs(locale, copy.profile.eyebrow)}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          emblem={<LoaderCircle />}
          eyebrow={copy.profile.eyebrow}
          title={copy.profile.loadingTitle}
          lede={copy.profile.loadingText}
        />
      </div>
    </AtlasFrame>
  );
}
