import { AtlasFrame, AtlasHero, AtlasSection, AtlasStats } from "@/components/atlas";
import { MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import { BATTLE_NET_REGIONS } from "@/lib/wow/battleNetCharacters";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { CharacterSignInButton } from "./CharacterActions";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterAtlasMaterial, frostPlaqueStyle } from "./characterAtlasMaterial";
import { FrostLoginIcon, type FrostLoginIconKind } from "./FrostLoginIcon";
import styles from "./characterAtlas.module.css";

const unlockIcons: FrostLoginIconKind[] = ["equipment", "talents", "combat"];

/**
 * Signed-out /wow/characters, built like the reference hubs (docs/design/reference): the Frost scene
 * behind the hero, the one painted sign-in action, honest facts, then what the sign-in opens as
 * plaques of the section's kit. No character is shown before Battle.net answers.
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
          eyebrow={accountName ?? copy.secureEyebrow}
          title={copy.entry.title}
          lede={apiError ? <><strong className={styles.ledeAlert}>{copy.entry.expiredTitle}.</strong> {copy.entry.expiredText}</> : copy.entry.lede}
          actions={<div className={styles.actions}>
            <CharacterSignInButton locale={locale} reconnect={Boolean(apiError)} />
            <p className={styles.security}><FrostLoginIcon kind="lock" compact />{copy.passwordNote} {copy.scopeNote}</p>
          </div>}
        />
        <div className={styles.facts}>
          <AtlasStats label={copy.entry.statsLabel} items={[
            { value: String(BATTLE_NET_REGIONS.length), label: copy.entry.statRegions },
            { value: String(copy.entry.unlocks.length), label: copy.entry.statTools },
          ]} />
        </div>
      </div>
      <AtlasSection id="unlocks" title={copy.entry.unlocksTitle} description={copy.entry.unlocksText} className={styles.section}>
        <ul className={styles.unlocks}>
          {copy.entry.unlocks.map(([title, text], index) => (
            <li key={title}>
              <MaterialPlaque kit={CHARACTERS_KIT} style={frostPlaqueStyle} className={styles.plaque}>
                <FrostLoginIcon kind={unlockIcons[index] ?? "equipment"} />
                <h3 className={materialStyles.title}>{title}</h3>
                <p className={materialStyles.text}>{text}</p>
              </MaterialPlaque>
            </li>
          ))}
        </ul>
      </AtlasSection>
      </div>
    </AtlasFrame>
  );
}
