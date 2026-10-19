import { LockKeyhole, ScrollText, Shield, Swords } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasPanel } from "@/components/atlas";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import { characterScene } from "./characterScene";
import styles from "./characterRosterPage.module.css";

const unlockIcons = [Shield, ScrollText, Swords];

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
    <AtlasFrame lang={locale} art={scene.art} artPosition={scene.position} artShade="deep" dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry" }}>
      <AtlasHero
        breadcrumbs={characterCrumbs(locale)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={accountName ?? copy.entry.eyebrow}
        title={copy.entry.title}
        lede={copy.entry.lede}
        aside={
          <AtlasPanel as="section" padding="lg" className={styles.signInCard} aria-labelledby="battlenet-connect-title">
            <BattleNetConnectPanel
              eyebrow={copy.secureEyebrow}
              title={apiError ? copy.entry.expiredTitle : copy.entry.panelTitle}
              description={apiError ? copy.entry.expiredText : copy.entry.panelText}
              note={<><LockKeyhole aria-hidden="true" />{copy.passwordNote} {copy.scopeNote}</>}
            >
              <BattleNetSignIn locale={locale} reconnect={Boolean(apiError)} />
            </BattleNetConnectPanel>
            <div className={styles.unlocks}>
              <h3>{copy.entry.unlocksTitle}</h3>
              <ul>
                {copy.entry.unlocks.map(([title, text], index) => {
                  const Icon = unlockIcons[index] ?? Shield;
                  return <li key={title}><Icon aria-hidden="true" /><span><strong>{title}</strong>{text}</span></li>;
                })}
              </ul>
            </div>
          </AtlasPanel>
        }
      />
    </AtlasFrame>
  );
}
