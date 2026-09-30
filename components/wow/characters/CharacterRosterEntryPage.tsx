import { LockKeyhole, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { CharacterBookRibbon } from "./CharacterBookRibbon";
import { CharacterBookMasthead } from "./CharacterBookMasthead";
import { CharacterEntryProof, CharacterEntryRoadmap } from "./CharacterEntryGuide";
import { CharacterBookBackdrop } from "@/components/wow/audit/CharacterBookBackdrop";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import grimoire from "@/components/wow/audit/grimoireControls.module.css";
import typography from "@/components/wow/audit/grimoireTypography.module.css";
import illumination from "@/components/wow/audit/characterBookIllumination.module.css";
import surface from "@/components/wow/audit/characterBookSurface.module.css";
import styles from "./characterRosterPage.module.css";

type Locale = "en" | "ru";

const copy = {
  en: {
    title: "Account characters",
    intro: "After sign-in, your WoW characters load from the official Battle.net profile.",
    entryEyebrow: "Official API",
    contents: "Contents",
    bookTitle: "Heroes",
    connectChapter: "Connect",
    archive: "Hero chronicle",
    secureAccess: "Secure Battle.net sign-in",
    connectTitle: "Connect your Battle.net account",
    connectText: "Sign in with Battle.net to load your WoW characters.",
    expiredTitle: "Battle.net session expired",
    expiredText: "Connect your account again to refresh access to your character list.",
    secureNote: "Your password stays with Blizzard.",
  },
  ru: {
    title: "Персонажи аккаунта",
    intro: "После входа покажем персонажей WoW из официального профиля Battle.net.",
    entryEyebrow: "Official API",
    contents: "Оглавление",
    bookTitle: "Герои",
    connectChapter: "Подключение",
    archive: "Летопись героя",
    secureAccess: "Защищённый вход Battle.net",
    connectTitle: "Подключите аккаунт Battle.net",
    connectText: "Войдите через Battle.net — загрузим ваших героев WoW.",
    expiredTitle: "Сессия Battle.net истекла",
    expiredText: "Подключите аккаунт заново, чтобы обновить доступ к списку персонажей.",
    secureNote: "Пароль вводится только на стороне Blizzard.",
  },
} satisfies Record<Locale, Record<string, string>>;

export function CharacterRosterEntryPage({ locale, accountName, apiError }: {
  locale: Locale;
  accountName?: string;
  apiError?: "expired";
}) {
  const t = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const title = apiError ? t.expiredTitle : t.connectTitle;
  const description = apiError ? t.expiredText : t.connectText;

  return (
    <main
      className={`${styles.roster} ${surface.root} ${grimoire.theme} ${typography.typography} ${illumination.page}`}
      data-character-book="open"
      data-roster-view="entry"
      lang={locale}
      style={physicalBookMaterials as CSSProperties}
    >
      <div className={surface.backdrop} data-character-book-backdrop aria-hidden="true"><CharacterBookBackdrop /></div>
      <div className={`${styles.bookContent} ${surface.content}`}>
        <div className={`${styles.manuscript} ${surface.manuscript}`}>
          <PhysicalBookFrame />
          <CharacterBookRibbon
            locale={locale}
            contents={t.contents}
            title={t.bookTitle}
            homeHref={`${prefix}/wow/characters`}
            items={[{ number: "01", label: t.connectChapter, href: "#account-overview", active: true }]}
          />
          <CharacterBookMasthead locale={locale} rightLabel={t.archive} />
          <header className={`${styles.hero} ${illumination.identity}`} id="account-overview">
            <div className={styles.identityCopy}>
              <span className={styles.eyebrow}><Users aria-hidden="true" />{accountName ?? t.entryEyebrow}</span>
              <h1>{t.title}</h1>
              <p>{t.intro}</p>
              <CharacterEntryProof locale={locale} />
            </div>
            <BattleNetConnectPanel eyebrow={t.secureAccess} title={title} description={description}>
              <BattleNetSignIn locale={locale} reconnect={Boolean(apiError)} />
              {!apiError ? <span className={styles.secureNote}><LockKeyhole aria-hidden="true" />{t.secureNote}</span> : null}
            </BattleNetConnectPanel>
          </header>
          <CharacterEntryRoadmap locale={locale} />
        </div>
      </div>
    </main>
  );
}
