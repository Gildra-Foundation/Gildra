import { ArrowLeft, RefreshCw } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { CharacterSignInButton, FrostLinkButton } from "./CharacterActions";
import { characterCopy, characterCrumbs } from "./characterCopy";
import { characterAtlasMaterial } from "./characterAtlasMaterial";
import styles from "./characterAtlas.module.css";

type ErrorCode = "expired" | "forbidden" | "rate_limited" | "incomplete" | "unavailable";

/** A character profile that Battle.net could not return: the reference hero, what happened and the way forward. */
export function CharacterProfileLoadError({ locale, code, retryHref }: { locale: "en" | "ru"; code: ErrorCode; retryHref: string }) {
  const copy = characterCopy[locale];
  const [title, description] = copy.profile.errors[code];
  const prefix = locale === "ru" ? "/ru" : "";
  const reconnect = code === "expired" || code === "forbidden";
  return (
    <AtlasFrame lang={locale} still foot={false} className={styles.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "error", "data-frost-login": true }}>
      <CharacterAtlasBackdrop />
      <div className={styles.material} style={characterAtlasMaterial}>
        <div className={styles.hero}>
          <AtlasHero
            align="start"
            className={styles.heroHeader}
            breadcrumbs={characterCrumbs(locale, copy.profile.eyebrow)}
            breadcrumbsLabel={copy.breadcrumbsLabel}
            title={title}
            lede={description}
            actions={<div className={`${styles.actions} ${styles.actionRow}`}>
              {reconnect
                ? <CharacterSignInButton locale={locale} reconnect />
                : <FrostLinkButton fit="stack" variant="primary" href={retryHref} prefetch={false} icon={<RefreshCw aria-hidden="true" />}>{copy.profile.retry}</FrostLinkButton>}
              <FrostLinkButton fit="stack" href={`${prefix}/wow/characters`} icon={<ArrowLeft aria-hidden="true" />}>{copy.profile.backToRoster}</FrostLinkButton>
            </div>}
          />
        </div>
      </div>
    </AtlasFrame>
  );
}
