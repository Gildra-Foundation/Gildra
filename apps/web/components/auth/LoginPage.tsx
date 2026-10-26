import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { AtlasFrame, AtlasHero } from "@/components/atlas";
import { BattleNetConnectPanel } from "@/components/wow/characters/BattleNetConnectPanel";
import { characterCopy, characterCrumbs } from "@/components/wow/characters/characterCopy";
import { BattleNetSignIn, BattleNetSignOut } from "./BattleNetActions";
import styles from "./loginPage.module.css";
import { FrostLoginAtmosphere } from "@/components/wow/characters/FrostLoginAtmosphere";
import { FrostLoginCrest } from "@/components/wow/characters/FrostLoginCrest";
import { FrostLoginIcon } from "@/components/wow/characters/FrostLoginIcon";
import frost from "@/components/wow/characters/frostLogin.module.css";
import { frostLoginMaterial } from "@/components/wow/characters/frostLoginAssets";

type Props = { locale: "en" | "ru"; accountName?: string; configured: boolean; isConnected: boolean };

/** /login: the hero with the Battle.net sign-in card beside it — nothing else. */
export function LoginPage({ locale, accountName, configured, isConnected }: Props) {
  const copy = characterCopy[locale];
  const login = copy.login;
  const prefix = locale === "ru" ? "/ru" : "";

  const card = isConnected ? (
    <BattleNetConnectPanel className={frost.connectPanel} eyebrowIcon={<FrostLoginIcon kind="equipment" compact />} eyebrow={copy.secureEyebrow} title={login.connectedTitle} description={login.ledeConnected}>
      <p className={styles.connected}><CircleCheck aria-hidden="true" /><span><small>{login.signedInAs}</small><b>{accountName || login.connectedFallback}</b></span></p>
      <Link data-folio-action href={`${prefix}/wow/characters`}>{login.viewCharacters}</Link>
      <BattleNetSignOut locale={locale} />
    </BattleNetConnectPanel>
  ) : configured ? (
    <BattleNetConnectPanel className={frost.connectPanel} eyebrowIcon={<FrostLoginIcon kind="equipment" compact />} eyebrow={copy.secureEyebrow} title={login.panelTitle} description={login.panelText} note={<><FrostLoginIcon kind="lock" compact /><span className={frost.securityCopy}>{copy.scopeNote}</span></>}>
      <BattleNetSignIn locale={locale} />
    </BattleNetConnectPanel>
  ) : (
    <BattleNetConnectPanel className={frost.connectPanel} eyebrowIcon={<FrostLoginIcon kind="equipment" compact />} eyebrow={copy.secureEyebrow} title={login.notConfiguredTitle} description={login.notConfiguredText} />
  );

  return (
    <AtlasFrame lang={locale} art="/assets/wow/character-book/intro/icecrown-home-background-v1.webp" artPosition="62% 24%" artShade="deep" id="battle-net-login" still foot={false} className={frost.page} dataAttributes={{ "data-character-atlas": true, "data-roster-view": "entry", "data-frost-login": true }}>
      <FrostLoginAtmosphere />
      <AtlasHero
        className={frost.hero}
        breadcrumbs={characterCrumbs(locale, copy.signIn)}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={<span className={frost.silverLabel}>{isConnected ? login.eyebrowConnected : login.eyebrow}</span>}
        title={isConnected ? login.titleConnected : login.title}
        lede={isConnected ? login.ledeConnected : login.lede}
        aside={<div className={`${styles.card} ${frost.card}`} style={frostLoginMaterial}><FrostLoginCrest />{card}</div>}
      />
    </AtlasFrame>
  );
}
