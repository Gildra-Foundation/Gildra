import { AtlasFrame, AtlasHero } from "@/components/atlas";
import type { BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { CharacterRosterLazy as CharacterRoster } from "./CharacterRosterLazy";
import { CharacterAtlasBackdrop } from "./CharacterAtlasBackdrop";
import { CharacterSignOutButton } from "./CharacterActions";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterAtlasMaterial } from "./characterAtlasMaterial";
import styles from "./characterAtlas.module.css";

/** Signed-in /wow/characters: the reference hero on the server, the roster (counts, filters, cards) on the client. */
export function CharacterRosterConnectedPage({ locale, accountName, pendingRegions }: {
  locale: CharacterLocale;
  accountName?: string;
  pendingRegions: BattleNetRegion[];
}) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} still foot={false} className={styles.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "roster", "data-frost-login": true, "data-frost-roster": true }}>
      <CharacterAtlasBackdrop />
      <div className={styles.material} style={characterAtlasMaterial}>
        <div className={`${styles.hero} ${styles.heroCompact}`}>
          <AtlasHero
            align="start"
            className={styles.heroHeader}
            breadcrumbs={characterCrumbs(locale)}
            breadcrumbsLabel={copy.breadcrumbsLabel}
            eyebrow={accountName ? `${accountName} · ${copy.roster.eyebrowConnected}` : copy.roster.eyebrowConnected}
            title={copy.roster.title}
            lede={copy.roster.lede}
            actions={<div className={styles.actions}>
              <CharacterSignOutButton locale={locale} />
            </div>}
          />
        </div>
        <CharacterRoster locale={locale} copy={copy.rosterList} pendingRegions={pendingRegions} />
      </div>
    </AtlasFrame>
  );
}
