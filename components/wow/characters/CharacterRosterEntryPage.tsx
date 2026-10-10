import { LockKeyhole, Shield } from "lucide-react";
import { BattleNetSignIn } from "@/components/auth/BattleNetActions";
import { BattleNetConnectPanel } from "./BattleNetConnectPanel";
import { CharacterEntryProof, CharacterEntryRoadmap } from "./CharacterEntryGuide";
import { CharacterAtlasShell, CharacterAtlasHeader } from "./CharacterAtlasShell";
import styles from "./characterRosterPage.module.css";

type Locale = "en" | "ru";

const copy = {
  en: {
    title: "Account characters",
    intro: "After sign-in, your WoW characters load from the official Battle.net profile.",
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
  const title = apiError ? t.expiredTitle : t.connectTitle;
  const description = apiError ? t.expiredText : t.connectText;

  return (
    <CharacterAtlasShell locale={locale} view="entry">
      <CharacterAtlasHeader title={t.title} intro={t.intro} eyebrow={accountName ?? (locale === "ru" ? "Официальный профиль Blizzard" : "Official Blizzard profile")}>
        <span className={styles.apiBadge}><Shield aria-hidden="true" /><span>Battle.net<small>{locale === "ru" ? "Защищённый вход" : "Secure sign-in"}</small></span></span>
      </CharacterAtlasHeader>
      <section className={styles.entryGrid} aria-label={locale === "ru" ? "Подключение аккаунта" : "Connect your account"}>
        <div className={styles.entryArt}>
          <div className={styles.artCaption}>
            <span className={styles.eyebrow}>WORLD OF WARCRAFT</span>
            <h2>{locale === "ru" ? "Твои герои. Твоя история." : "Your heroes. Your story."}</h2>
            <p>{locale === "ru" ? "Экипировка, таланты и боевые инструменты — в профиле твоего персонажа." : "Equipment, talents, and combat tools — in your character’s profile."}</p>
          </div>
        </div>
        <div className={styles.entrySidebar}>
          <BattleNetConnectPanel variant="atlas" eyebrow={t.secureAccess} title={title} description={description}>
            <BattleNetSignIn locale={locale} reconnect={Boolean(apiError)} />
            {!apiError ? <span className={styles.secureNote}><LockKeyhole aria-hidden="true" />{t.secureNote}</span> : null}
          </BattleNetConnectPanel>
          <CharacterEntryProof locale={locale} variant="atlas" />
        </div>
      </section>
      <CharacterEntryRoadmap locale={locale} variant="atlas" />
    </CharacterAtlasShell>
  );
}
