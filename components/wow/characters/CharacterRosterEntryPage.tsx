import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasPanel } from "@/components/atlas";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { characterCopy, characterCrumbs, type CharacterLocale } from "./characterCopy";
import styles from "./characterRosterPage.module.css";

/** Signed-out /wow/characters: the hero and one sign-in panel with artwork. */
export function CharacterRosterEntryPage({ locale, accountName, apiError }: {
  locale: CharacterLocale;
  accountName?: string;
  apiError?: "expired";
}) {
  const copy = characterCopy[locale];
  return (
    <AtlasFrame lang={locale} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry" }}>
      <AtlasHero
        breadcrumbs={characterCrumbs(locale)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={accountName ?? copy.entry.eyebrow}
        title={copy.entry.title}
        lede={copy.entry.lede}
      />
      <AtlasPanel as="section" padding="none" className={styles.entry} aria-labelledby="battlenet-connect-title">
        <div className={styles.entryArt} aria-hidden="true">
          <Image src="/assets/wow/character-book/intro/varok-home-background-v2.webp" alt="" fill sizes="(max-width: 860px) 100vw, 58vw" loading="eager" fetchPriority="high" />
        </div>
        <div className={styles.entryBody}>
          <BattleNetConnectPanel
            eyebrow={copy.secureEyebrow}
            title={apiError ? copy.entry.expiredTitle : copy.entry.panelTitle}
            description={apiError ? copy.entry.expiredText : copy.entry.panelText}
            note={<><LockKeyhole aria-hidden="true" />{copy.passwordNote}</>}
          >
            <BattleNetSignIn locale={locale} reconnect={Boolean(apiError)} />
          </BattleNetConnectPanel>
        </div>
      </AtlasPanel>
    </AtlasFrame>
  );
}
