import Link from "next/link";
import { Check, LockKeyhole, Swords } from "lucide-react";
import { BattleNetSignIn, BattleNetSignOut } from "./BattleNetActions";
import { CharacterBookBackdrop } from "@/components/wow/audit/CharacterBookBackdrop";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import surface from "@/components/wow/audit/characterBookSurface.module.css";
import grimoire from "@/components/wow/audit/grimoireControls.module.css";
import typography from "@/components/wow/audit/grimoireTypography.module.css";
import illumination from "@/components/wow/audit/characterBookIllumination.module.css";
import { CharacterBookRibbon } from "@/components/wow/characters/CharacterBookRibbon";
import { CharacterBookMasthead } from "@/components/wow/characters/CharacterBookMasthead";
import { BattleNetConnectPanel } from "@/components/wow/characters/BattleNetConnectPanel";
import { CharacterEntryProof, CharacterEntryRoadmap } from "@/components/wow/characters/CharacterEntryGuide";
import styles from "./loginPage.module.css";
import type { CSSProperties } from "react";

type Props = { locale: "en" | "ru"; accountName?: string; configured: boolean; isConnected: boolean };

export function LoginPage({ locale, accountName, configured, isConnected }: Props) {
  const ru = locale === "ru"; const prefix = ru ? "/ru" : "";
  const pageKicker = isConnected
    ? (ru ? "Battle.net подключён" : "Battle.net connected")
    : (ru ? "Подключение Battle.net" : "Battle.net account link");
  const pageTitle = isConnected
    ? (ru ? "Книга твоего героя готова." : "Your hero’s folio is ready.")
    : (ru ? "Ваши персонажи. Ваш боевой штаб." : "Your characters. Your war room.");
  const pageIntro = isConnected
    ? (ru ? "Аккаунт уже подключён. Открой список персонажей и выбери героя для разбора." : "Your account is connected. Open your roster and choose a hero to inspect.")
    : (ru ? "Подключите Battle.net — и персонажи WoW появятся в вашем профиле Gildra." : "Connect Battle.net once to bring your WoW roster into Gildra.");
  return <main className={`${styles.page} ${surface.root} ${grimoire.theme} ${typography.typography} ${illumination.page}`} data-character-book="open" data-character-book-entry="login" lang={locale} style={physicalBookMaterials as CSSProperties}>
    <div className={surface.backdrop} data-character-book-backdrop aria-hidden="true"><CharacterBookBackdrop /></div>
    <div className={surface.content}>
      <div className={`${surface.manuscript} ${styles.manuscript}`}>
      <PhysicalBookFrame />
      <CharacterBookRibbon
        locale={locale}
        contents={ru ? "Оглавление" : "Contents"}
        title="Gildra"
        homeHref={prefix || "/"}
        englishHref="/login"
        russianHref="/ru/login"
        items={[{ number: "01", label: ru ? "Подключение аккаунта" : "Account access", href: "#battle-net-login", active: true }]}
      />
      <CharacterBookMasthead locale={locale} rightLabel={ru ? "Книга героя" : "Hero chronicle"} />
      <section className={styles.shell} id="battle-net-login">
      <div className={styles.intro}>
        <span className={styles.kicker}><Swords />{pageKicker}</span>
        <h1>{pageTitle}</h1>
        <p>{pageIntro}</p>
        {!isConnected ? <CharacterEntryProof locale={locale} /> : null}
      </div>
      <BattleNetConnectPanel
        eyebrow={ru ? "Защищённый вход Battle.net" : "Secure Battle.net sign-in"}
        title={isConnected ? (ru ? "Аккаунт подключён" : "Account connected") : configured ? (ru ? "Вход в аккаунт" : "Account sign in") : (ru ? "Авторизация ещё не настроена" : "Authentication is not configured")}
        description={isConnected
          ? (ru ? "Аккаунт Battle.net готов. Перейдите к списку персонажей." : "Your Battle.net account is ready. Continue to your characters.")
          : configured
            ? (ru ? "Войдите на защищённом сайте Battle.net — пароль останется у Blizzard." : "Sign in on Battle.net’s secure site; Gildra never sees your password.")
            : (ru ? "Добавьте BATTLENET_CLIENT_ID, BATTLENET_CLIENT_SECRET и AUTH_SECRET в окружение сервера." : "Add BATTLENET_CLIENT_ID, BATTLENET_CLIENT_SECRET and AUTH_SECRET to the server environment.")}
      >
        {isConnected ? <>
          <div className={styles.connected}><Check /><span><small>{ru ? "Вы вошли как" : "Signed in as"}</small><b>{accountName || (ru ? "Battle.net подключён" : "Battle.net connected")}</b></span></div>
          <Link className={styles.profileButton} data-folio-action href={`${prefix}/wow/characters`}>{ru ? "Показать персонажей" : "View characters"}</Link>
          <div className={styles.signOut}><BattleNetSignOut locale={locale} /></div>
        </> : configured ? <>
          <BattleNetSignIn locale={locale} />
          <small className={styles.consent}><LockKeyhole />{ru ? "Запрашивается только доступ к профилю WoW" : "Only WoW profile access is requested"}</small>
        </> : <div className={styles.configError} role="status"><b>{ru ? "Проверьте настройки сервера" : "Check the server configuration"}</b></div>}
      </BattleNetConnectPanel>
      </section>
      {!isConnected ? <CharacterEntryRoadmap locale={locale} /> : null}
      </div>
    </div>
  </main>;
}
