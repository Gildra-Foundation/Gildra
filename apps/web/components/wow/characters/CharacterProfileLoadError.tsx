import { RefreshCw, ShieldAlert } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import { characterCopy, characterCrumbs } from "./characterCopy";

type ErrorCode = "expired" | "forbidden" | "rate_limited" | "incomplete" | "unavailable";

/** A character profile that Battle.net could not return: what happened and the one way forward. */
export function CharacterProfileLoadError({ locale, code, retryHref }: { locale: "en" | "ru"; code: ErrorCode; retryHref: string }) {
  const copy = characterCopy[locale];
  const [title, description] = copy.profile.errors[code];
  const prefix = locale === "ru" ? "/ru" : "";
  const reconnect = code === "expired" || code === "forbidden";
  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "error" }}>
      <AtlasHero
        breadcrumbs={characterCrumbs(locale, copy.profile.eyebrow)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.profile.eyebrow}
        title={title}
        lede={description}
        actions={<>
          {reconnect
            ? <AtlasLinkButton variant="primary" href={`${prefix}/login`} icon={<ShieldAlert aria-hidden="true" />}>{copy.profile.reconnect}</AtlasLinkButton>
            : <AtlasLinkButton variant="primary" href={retryHref} prefetch={false} icon={<RefreshCw aria-hidden="true" />}>{copy.profile.retry}</AtlasLinkButton>}
          <AtlasLinkButton href={`${prefix}/wow/characters`}>{copy.profile.backToRoster}</AtlasLinkButton>
        </>}
      />
    </AtlasFrame>
  );
}
