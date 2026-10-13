import Link from "next/link";
import { CircleCheck, LockKeyhole } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { BattleNetConnectPanel } from "@/components/wow/characters/BattleNetConnectPanel";
import { characterCopy, characterCrumbs } from "@/components/wow/characters/characterCopy";
import { BattleNetSignIn, BattleNetSignOut } from "./BattleNetActions";
import styles from "./loginPage.module.css";

type Props = { locale: "en" | "ru"; accountName?: string; configured: boolean; isConnected: boolean };

/** /login: the hero with the Battle.net sign-in card beside it — nothing else. */
export function LoginPage({ locale, accountName, configured, isConnected }: Props) {
  const copy = characterCopy[locale];
  const login = copy.login;
  const prefix = locale === "ru" ? "/ru" : "";

  const card = isConnected ? (
    <BattleNetConnectPanel eyebrow={copy.secureEyebrow} title={login.connectedTitle} description={login.ledeConnected}>
      <p className={styles.connected}><CircleCheck aria-hidden="true" /><span><small>{login.signedInAs}</small><b>{accountName || login.connectedFallback}</b></span></p>
      <Link data-folio-action href={`${prefix}/wow/characters`}>{login.viewCharacters}</Link>
      <BattleNetSignOut locale={locale} />
    </BattleNetConnectPanel>
  ) : configured ? (
    <BattleNetConnectPanel eyebrow={copy.secureEyebrow} title={login.panelTitle} description={login.panelText} note={<><LockKeyhole aria-hidden="true" />{copy.scopeNote}</>}>
      <BattleNetSignIn locale={locale} />
    </BattleNetConnectPanel>
  ) : (
    <BattleNetConnectPanel eyebrow={copy.secureEyebrow} title={login.notConfiguredTitle} description={login.notConfiguredText} />
  );

  return (
    <AtlasFrame lang={locale} scene="login" id="battle-net-login" dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry" }}>
      <AtlasHero
        breadcrumbs={characterCrumbs(locale, copy.signIn)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={isConnected ? login.eyebrowConnected : login.eyebrow}
        title={isConnected ? login.titleConnected : login.title}
        lede={isConnected ? login.ledeConnected : login.lede}
        aside={<div className={styles.card}>{card}</div>}
      />
    </AtlasFrame>
  );
}
