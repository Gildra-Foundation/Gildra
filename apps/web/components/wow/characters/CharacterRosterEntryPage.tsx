import { AtlasFrame, AtlasHero, AtlasPanel } from "@/components/atlas";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterScene } from "./characterScene";
import { FrostLoginAtmosphere } from "./FrostLoginAtmosphere";
import { FrostLoginCrest } from "./FrostLoginCrest";
import { FrostLoginIcon, type FrostLoginIconKind } from "./FrostLoginIcon";
import frost from "./frostLogin.module.css";
import { frostLoginMaterial } from "./frostLoginAssets";
import styles from "./characterRosterPage.module.css";

const unlockIcons: FrostLoginIconKind[] = ["equipment", "talents", "combat"];

/**
 * Signed-out /wow/characters: the reader's homepage character as the scene, the
 * hero and, beside it, the one sign-in card (first screen on phones too).
 */
export async function CharacterRosterEntryPage({ locale, accountName, apiError }: {
  locale: CharacterLocale;
  accountName?: string;
  apiError?: "expired";
}) {
  const copy = characterCopy[locale];
  const scene = await characterScene();
  return (
    <AtlasFrame lang={locale} art={scene.art} artPosition={scene.position} artShade="deep" still foot={false} className={frost.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry", "data-frost-login": true }}>
      <FrostLoginAtmosphere />
      <AtlasHero
        className={frost.hero}
        breadcrumbs={characterCrumbs(locale)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<span className={frost.silverLabel}>{accountName ?? copy.entry.eyebrow}</span>}
        title={copy.entry.title}
        lede={copy.entry.lede}
        aside={
          <div style={frostLoginMaterial}><AtlasPanel as="section" padding="lg" className={`${styles.signInCard} ${frost.card}`} aria-labelledby="battlenet-connect-title">
            <FrostLoginCrest />
            <BattleNetConnectPanel
              className={frost.connectPanel}
              eyebrowIcon={<FrostLoginIcon kind="equipment" compact />}
              eyebrow={copy.secureEyebrow}
              title={apiError ? copy.entry.expiredTitle : copy.entry.panelTitle}
              description={apiError ? copy.entry.expiredText : copy.entry.panelText}
              note={<><FrostLoginIcon kind="lock" compact /><span className={frost.securityCopy}>{copy.passwordNote} {copy.scopeNote}</span></>}
            >
              <BattleNetSignIn locale={locale} reconnect={Boolean(apiError)} />
            </BattleNetConnectPanel>
            <div className={`${styles.unlocks} ${frost.unlocks}`}>
              <h3>{copy.entry.unlocksTitle}</h3>
              <ul>
                {copy.entry.unlocks.map(([title, text], index) => {
                  return <li key={title}><FrostLoginIcon kind={unlockIcons[index] ?? "equipment"} /><span><strong>{title}</strong>{text}</span></li>;
                })}
              </ul>
            </div>
          </AtlasPanel></div>
        }
      />
    </AtlasFrame>
  );
}
