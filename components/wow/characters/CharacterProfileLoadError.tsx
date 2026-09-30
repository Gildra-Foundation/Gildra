import { AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import { CharacterBookStateFrame } from "./CharacterBookStateFrame";
import styles from "./characterProfileLoadError.module.css";

type ErrorCode = "expired" | "forbidden" | "rate_limited" | "incomplete" | "unavailable";

const copy = {
  ru: {
    expired: ["Сессия Battle.net истекла", "Переподключите аккаунт, чтобы снова получить профиль персонажа."],
    forbidden: ["Нет доступа к профилю", "Battle.net отклонил доступ. Переподключите аккаунт и подтвердите разрешение профиля WoW."],
    rate_limited: ["Слишком много запросов", "Battle.net временно ограничил обновления. Подождите около минуты и попробуйте снова."],
    incomplete: ["Профиль пока неполный", "Battle.net не вернул экипировку или активную специализацию. Выйдите персонажем из игры и обновите страницу."],
    unavailable: ["Battle.net временно недоступен", "Мы не подставляем тестовые данные вместо вашего персонажа. Попробуйте снова чуть позже."],
    reconnect: "Переподключить Battle.net", retry: "Повторить", roster: "К списку персонажей",
  },
  en: {
    expired: ["Battle.net session expired", "Reconnect your account to load this character again."],
    forbidden: ["Profile access denied", "Battle.net denied profile access. Reconnect and approve the WoW profile permission."],
    rate_limited: ["Too many requests", "Battle.net temporarily limited updates. Wait about a minute and try again."],
    incomplete: ["Profile is incomplete", "Battle.net did not return equipment or an active specialization. Log out of the game and refresh."],
    unavailable: ["Battle.net is temporarily unavailable", "We will not substitute demo data for your character. Please try again later."],
    reconnect: "Reconnect Battle.net", retry: "Try again", roster: "Back to characters",
  },
} as const;

export function CharacterProfileLoadError({ locale, code, retryHref }: { locale: "en" | "ru"; code: ErrorCode; retryHref: string }) {
  const t = copy[locale];
  const [title, description] = t[code];
  const prefix = locale === "ru" ? "/ru" : "";
  const englishHref = retryHref.replace(/^\/ru(?=\/)/, "");
  const russianHref = retryHref.startsWith("/ru/") ? retryHref : `/ru${retryHref.startsWith("/") ? "" : "/"}${retryHref}`;
  const reconnect = code === "expired" || code === "forbidden";
  return <CharacterBookStateFrame locale={locale} englishHref={englishHref} russianHref={russianHref}>
    <main className={styles.page}>
      <section className={styles.spread} id="profile-error" role="alert" aria-labelledby="character-load-error-title">
        <div className={styles.leftLeaf}>
          <span className={styles.seal} aria-hidden="true">{reconnect ? <ShieldAlert /> : <AlertTriangle />}</span>
          <small className={styles.rubric}>{locale === "ru" ? "МИР WARCRAFT · BATTLE.NET" : "WORLD OF WARCRAFT · BATTLE.NET"}</small>
          <h1 id="character-load-error-title">{title}</h1>
        </div>
        <div className={styles.rightLeaf}>
          <p>{description}</p>
          <span className={styles.divider} aria-hidden="true" />
          <div className={styles.actions}>
            {reconnect
              ? <a href={`${prefix}/login`} data-folio-action="primary"><ShieldAlert aria-hidden="true" />{t.reconnect}</a>
              : <a href={retryHref} data-folio-action="primary"><RefreshCw aria-hidden="true" />{t.retry}</a>}
            <a href={`${prefix}/wow/characters`} data-folio-action="quiet">{t.roster}</a>
          </div>
        </div>
      </section>
    </main>
  </CharacterBookStateFrame>;
}
