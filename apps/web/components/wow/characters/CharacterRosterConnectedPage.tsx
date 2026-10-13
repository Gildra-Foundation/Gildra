import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { BattleNetSignOut } from "@/components/auth/BattleNetActions";
import type { BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { CharacterRosterLazy as CharacterRoster } from "./CharacterRosterLazy";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import styles from "./characterRosterPage.module.css";

/** Signed-in /wow/characters: the hero renders on the server, the roster loads its regions on the client. */
export function CharacterRosterConnectedPage({ locale, accountName, pendingRegions }: {
  locale: CharacterLocale;
  accountName?: string;
  pendingRegions: BattleNetRegion[];
}) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "roster" }}>
      <AtlasHero
        breadcrumbs={characterCrumbs(locale)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        toolbar={<div className={styles.signOut}><BattleNetSignOut locale={locale} /></div>}
        eyebrow={accountName ? `${accountName} · ${copy.roster.eyebrowConnected}` : copy.roster.eyebrowConnected}
        title={copy.roster.title}
        lede={copy.roster.lede}
      />
      <CharacterRoster locale={locale} copy={copy.rosterList} pendingRegions={pendingRegions} secureEyebrow={copy.secureEyebrow} />
    </AtlasFrame>
  );
}
