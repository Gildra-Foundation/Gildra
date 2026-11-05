import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { CharacterSignInButton } from "./CharacterActions";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterAtlasMaterial } from "./characterAtlasMaterial";
import { FrostLoginIcon } from "./FrostLoginIcon";
import { UnlockCards } from "./UnlockCards";
import styles from "./characterAtlas.module.css";

/** Frost Hall paintings of the three cards, in the order of `copy.entry.unlocks`. */
const unlockArt = ["equipment", "talents", "combat"].map((name) => `/assets/wow/characters/unlocks/${name}.webp`);

/**
 * Signed-out /wow/characters, built like the reference hubs (docs/design/reference): the Frost scene
 * behind the hero, the one painted sign-in action, then the three painted notched cards of what a hero page holds. No character is shown before Battle.net answers.
 */
export function CharacterRosterEntryPage({ locale, accountName, apiError }: {
  locale: CharacterLocale;
  accountName?: string;
  apiError?: "expired";
}) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} still foot={false} className={styles.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry", "data-frost-login": true }}>
      <CharacterAtlasBackdrop />
      <div className={styles.material} style={characterAtlasMaterial}>
      <div className={styles.hero}>
        <AtlasHero
          align="start"
          className={styles.heroHeader}
          breadcrumbs={characterCrumbs(locale)}
          breadcrumbsLabel={copy.breadcrumbsLabel}
          eyebrow={accountName}
          title={copy.entry.title}
          lede={apiError ? <><strong className={styles.ledeAlert}>{copy.entry.expiredTitle}.</strong> {copy.entry.expiredText}</> : undefined}
          actions={<div className={styles.actions}>
            <CharacterSignInButton locale={locale} reconnect={Boolean(apiError)} />
            <p className={styles.security}><FrostLoginIcon kind="lock" compact />{copy.entry.passwordNote}</p>
          </div>}
        />
      </div>
      <AtlasSection id="unlocks" className={styles.section}>
        <UnlockCards cards={copy.entry.unlocks.map((card, index) => ({ ...card, art: unlockArt[index] }))} />
      </AtlasSection>
      </div>
    </AtlasFrame>
  );
}
