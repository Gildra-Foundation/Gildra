import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { BattleNetSignOut } from "@/components/auth/BattleNetActions";
import type { BattleNetRegion } from "@/lib/wow/battleNetCharacters";
import { CharacterRosterLazy as CharacterRoster } from "./CharacterRosterLazy";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterScene } from "./characterScene";
import { FrostLoginAtmosphere } from "./FrostLoginAtmosphere";
import { FrostLoginIcon } from "./FrostLoginIcon";
import { characterFrostMaterial } from "./characterFrostAssets";
import login from "./frostLogin.module.css";
import frost from "./characterFrost.module.css";
import styles from "./characterRosterPage.module.css";

/** Signed-in /wow/characters: the hero renders on the server, the roster loads its regions on the client. */
export async function CharacterRosterConnectedPage({ locale, accountName, pendingRegions }: {
  locale: CharacterLocale;
  accountName?: string;
  pendingRegions: BattleNetRegion[];
}) {
  const copy = characterCopy[locale];
  const scene = await characterScene();
  return (
    <AtlasFrame lang={locale} art={scene.art} artPosition={scene.position} artShade="deep" still foot={false} className={`${login.page} ${frost.page}`} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "roster", "data-frost-login": true, "data-frost-roster": true }}>
      <FrostLoginAtmosphere />
      <div style={characterFrostMaterial}>
      <AtlasHero
        className={frost.hero}
        breadcrumbs={characterCrumbs(locale)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        toolbar={<div className={`${styles.signOut} ${frost.signOut}`}><BattleNetSignOut locale={locale} /></div>}
        eyebrow={<span className={frost.connection}><FrostLoginIcon kind="lock" compact />{accountName ? `${accountName} · ${copy.roster.eyebrowConnected}` : copy.roster.eyebrowConnected}</span>}
        title={copy.roster.title}
        lede={copy.roster.lede}
      />
      <CharacterRoster locale={locale} copy={copy.rosterList} pendingRegions={pendingRegions} secureEyebrow={copy.secureEyebrow} />
      </div>
    </AtlasFrame>
  );
}
