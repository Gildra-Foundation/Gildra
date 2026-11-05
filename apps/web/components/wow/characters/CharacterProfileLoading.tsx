import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { characterCopy, characterCrumbs } from "./characterCopy";
import { characterAtlasMaterial } from "./characterAtlasMaterial";
import styles from "./characterAtlas.module.css";

/** Shown while Battle.net returns the requested character: the section's reference hero, no client JS beyond the snow. */
export function CharacterProfileLoading({ locale }: { locale: "en" | "ru" }) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} still foot={false} className={styles.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "loading", "data-frost-login": true }}>
      <CharacterAtlasBackdrop />
      <div className={styles.material} style={characterAtlasMaterial}>
        <div className={styles.hero} role="status" aria-busy="true">
          <AtlasHero
            align="start"
            className={styles.heroHeader}
            breadcrumbs={characterCrumbs(locale, copy.profile.eyebrow)}
            breadcrumbsLabel={copy.breadcrumbsLabel}
            eyebrow={copy.profile.eyebrow}
            title={copy.profile.loadingTitle}
          />
        </div>
      </div>
    </AtlasFrame>
  );
}
