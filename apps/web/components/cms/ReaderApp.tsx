"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import styles from "./reader.module.css";
import type { Lang } from "@/lib/i18n-paths";

/**
 * Minimal reader (member) account UI for one site. Talks only to this site's
 * /api/readers proxy; the CMS token stays in an httpOnly cookie. Separate from
 * the Battle.net sign-in at /login.
 */
type Mode = "account" | "verify" | "reset";

const TEXT = {
  en: {
    title: "Reader account",
    verifyTitle: "Confirm your email",
    resetTitle: "Choose a new password",
    intro: "A free reader account for this site. It is separate from the Battle.net sign-in.",
    login: "Sign in",
    register: "Create account",
    forgot: "Forgot password",
    email: "Email",
    password: "Password",
    newPassword: "New password (10+ characters)",
    displayName: "Display name",
    handle: "Handle",
    bio: "About you",
    visibility: "Profile visibility",
    public: "Public",
    private: "Hidden",
    save: "Save profile",
    saved: "Profile saved.",
    signOut: "Sign out",
    signedInAs: (name: string) => `Signed in as ${name}.`,
    sendReset: "Send reset link",
    resetSent: "If an account exists for that address, a reset link is on its way.",
    registered: "Check your inbox and confirm your email address, then sign in.",
    existingHint: "Already have an account on another network site? Sign in with it below to join this site.",
    enrollOffer: "This network account is not a member of this site yet. Join this site with the same account?",
    enrollJoin: "Join and sign in",
    enrolled: "You joined this site.",
    confirm: "Confirm email",
    verified: "Your email is confirmed. You can sign in now.",
    resetDone: "Password changed. You can sign in now.",
    goSignIn: "Go to sign in",
    missingToken: "This link is incomplete. Open the link from the email again.",
    loading: "Loading…",
    errors: {
      "invalid-credentials": "Email or password is incorrect.",
      "email-not-verified": "Please confirm your email address first.",
      locked: "Too many attempts. Try again later.",
      "rate-limited": "Too many requests. Try again later.",
      "registration-closed": "Registration is closed on this site.",
      unavailable: "The service is unavailable right now. Please try again later.",
      "email-not-configured": "Email delivery is not configured, so new accounts cannot be confirmed right now.",
      invalid: "Please check the form.",
      "invalid-token": "This link is invalid or has expired.",
      forbidden: "This request was refused.",
      blocked: "This account cannot use this site.",
      error: "Something went wrong.",
    } as Record<string, string>,
  },
  ru: {
    title: "Аккаунт читателя",
    verifyTitle: "Подтверждение почты",
    resetTitle: "Новый пароль",
    intro: "Бесплатный аккаунт читателя этого сайта. Он не связан со входом через Battle.net.",
    login: "Войти",
    register: "Создать аккаунт",
    forgot: "Забыли пароль",
    email: "Почта",
    password: "Пароль",
    newPassword: "Новый пароль (от 10 символов)",
    displayName: "Отображаемое имя",
    handle: "Никнейм",
    bio: "О себе",
    visibility: "Видимость профиля",
    public: "Публичный",
    private: "Скрытый",
    save: "Сохранить профиль",
    saved: "Профиль сохранён.",
    signOut: "Выйти",
    signedInAs: (name: string) => `Вы вошли как ${name}.`,
    sendReset: "Отправить ссылку",
    resetSent: "Если аккаунт с этой почтой существует, ссылка для сброса уже отправлена.",
    registered: "Проверьте почту и подтвердите адрес, затем войдите.",
    existingHint: "Уже есть аккаунт на другом сайте сети? Войдите с ним ниже, чтобы присоединиться к этому сайту.",
    enrollOffer: "Этот аккаунт сети ещё не участник этого сайта. Присоединиться с тем же аккаунтом?",
    enrollJoin: "Присоединиться и войти",
    enrolled: "Вы присоединились к сайту.",
    confirm: "Подтвердить почту",
    verified: "Почта подтверждена. Теперь можно войти.",
    resetDone: "Пароль изменён. Теперь можно войти.",
    goSignIn: "Перейти ко входу",
    missingToken: "Ссылка неполная. Откройте ссылку из письма ещё раз.",
    loading: "Загрузка…",
    errors: {
      "invalid-credentials": "Неверная почта или пароль.",
      "email-not-verified": "Сначала подтвердите адрес почты.",
      locked: "Слишком много попыток. Попробуйте позже.",
      "rate-limited": "Слишком много запросов. Попробуйте позже.",
      "registration-closed": "Регистрация на этом сайте закрыта.",
      unavailable: "Сервис сейчас недоступен. Попробуйте позже.",
      "email-not-configured": "Отправка почты не настроена, поэтому новые аккаунты сейчас нельзя подтвердить.",
      invalid: "Проверьте заполнение формы.",
      "invalid-token": "Ссылка недействительна или устарела.",
      forbidden: "Запрос отклонён.",
      blocked: "Этот аккаунт не может пользоваться сайтом.",
      error: "Что-то пошло не так.",
    } as Record<string, string>,
  },
};

type Session = {
  authenticated: boolean;
  membership?: string;
  profile?: { handle: string | null; displayName: string | null; visibility: string | null } | null;
};
type Profile = { handle: string | null; displayName: string | null; bio: string | null; visibility: string | null };

async function call(action: string, init: { method?: string; body?: Record<string, unknown> } = {}) {
  const response = await fetch(`/api/readers/${action}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "content-type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data: Record<string, unknown> = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function Message({ text, kind = "info" }: { text: string | null; kind?: "info" | "error" }) {
  if (!text) return null;
  return (
    <p className={kind === "error" ? styles.error : styles.info} role={kind === "error" ? "alert" : "status"}>
      {text}
    </p>
  );
}

export function ReaderApp({ lang, mode, signInHref }: { lang: Lang; mode: Mode; signInHref: string }) {
  const t = TEXT[lang];
  const errorText = (code: unknown) => t.errors[String(code)] ?? t.errors.error;

  if (mode === "verify") return <VerifyView t={t} errorText={errorText} signInHref={signInHref} />;
  if (mode === "reset") return <ResetView t={t} errorText={errorText} signInHref={signInHref} />;
  return <AccountView t={t} errorText={errorText} />;
}

type ViewProps = { t: (typeof TEXT)["en"]; errorText: (code: unknown) => string };

function tokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("token");
  return token && /^[A-Za-z0-9._~-]{8,512}$/.test(token) ? token : null;
}

function VerifyView({ t, errorText, signInHref }: ViewProps & { signInHref: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<{ done?: boolean; error?: string | null; busy?: boolean }>({});
  useEffect(() => setToken(tokenFromUrl()), []);
  // Confirmation needs a click: mail scanners that prefetch links must not confirm accounts.
  const confirm = async () => {
    setState({ busy: true });
    const r = await call("verify", { body: { token } });
    setState(r.status === 200 ? { done: true } : { error: errorText(r.data.status) });
  };
  return (
    <section className={styles.panel}>
      <h1>{t.verifyTitle}</h1>
      {!token ? <Message kind="error" text={t.missingToken} /> : null}
      {state.done ? (
        <>
          <Message text={t.verified} />
          <a className={styles.button} href={signInHref}>{t.goSignIn}</a>
        </>
      ) : token ? (
        <button className={styles.button} type="button" onClick={confirm} disabled={state.busy}>
          {t.confirm}
        </button>
      ) : null}
      <Message kind="error" text={state.error ?? null} />
    </section>
  );
}

function ResetView({ t, errorText, signInHref }: ViewProps & { signInHref: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<{ done?: boolean; error?: string | null; busy?: boolean }>({});
  useEffect(() => setToken(tokenFromUrl()), []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setState({ busy: true });
    const r = await call("reset", { body: { token, password } });
    setState(r.status === 200 ? { done: true } : { error: errorText(r.data.status) });
  };
  return (
    <section className={styles.panel}>
      <h1>{t.resetTitle}</h1>
      {!token ? <Message kind="error" text={t.missingToken} /> : null}
      {state.done ? (
        <>
          <Message text={t.resetDone} />
          <a className={styles.button} href={signInHref}>{t.goSignIn}</a>
        </>
      ) : token ? (
        <form className={styles.form} onSubmit={submit}>
          <label>
            {t.newPassword}
            <input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
          </label>
          <button className={styles.button} type="submit" disabled={state.busy}>{t.resetTitle}</button>
        </form>
      ) : null}
      <Message kind="error" text={state.error ?? null} />
    </section>
  );
}

function AccountView({ t, errorText }: ViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [registration, setRegistration] = useState<string | null>(null);
  const [tab, setTab] = useState<"login" | "register" | "forgot">("login");
  const [message, setMessage] = useState<{ text: string; kind: "info" | "error" } | null>(null);
  const [enroll, setEnroll] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([call("session"), call("availability")]);
    setSession(s.status === 200 ? (s.data as Session) : { authenticated: false });
    setRegistration(a.status === 200 ? String(a.data.registration ?? "closed") : "unavailable");
    if (s.status === 200 && s.data.authenticated) {
      const p = await call("profile");
      setProfile(p.status === 200 ? ((p.data.profile as Profile) ?? null) : null);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    void run(async () => {
      const r = await call("login", { body: { email, password } });
      if (r.status === 200) return void (await refresh());
      if (r.data.status === "enrollment-available") return setEnroll({ email, password });
      setMessage({ text: errorText(r.data.status), kind: "error" });
    });
  };

  const confirmEnroll = () =>
    run(async () => {
      if (!enroll) return;
      const r = await call("login", { body: { ...enroll, enroll: true } });
      setEnroll(null);
      if (r.status === 200) {
        setMessage({ text: t.enrolled, kind: "info" });
        return void (await refresh());
      }
      setMessage({ text: errorText(r.data.status), kind: "error" });
    });

  const register = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const r = await call("register", {
        body: { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), displayName: String(form.get("displayName") ?? "") },
      });
      if (r.status === 202) {
        setTab("login");
        return setMessage({ text: `${t.registered} ${t.existingHint}`, kind: "info" });
      }
      setMessage({ text: errorText(r.data.reason ?? r.data.status), kind: "error" });
    });
  };

  const forgot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    void run(async () => {
      const r = await call("forgot", { body: { email } });
      setMessage(r.status === 202 ? { text: t.resetSent, kind: "info" } : { text: errorText(r.data.reason ?? r.data.status), kind: "error" });
    });
  };

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changes: Record<string, unknown> = {
      displayName: String(form.get("displayName") ?? ""),
      bio: String(form.get("bio") ?? ""),
      visibility: String(form.get("visibility") ?? "public"),
    };
    const handle = String(form.get("handle") ?? "").trim().toLowerCase();
    if (handle) changes.handle = handle;
    void run(async () => {
      const r = await call("profile", { method: "PATCH", body: changes });
      if (r.status === 200) {
        setProfile((r.data.profile as Profile) ?? profile);
        return setMessage({ text: t.saved, kind: "info" });
      }
      setMessage({ text: errorText(r.data.status), kind: "error" });
    });
  };

  const logout = () =>
    run(async () => {
      await call("logout", { body: {} });
      setProfile(null);
      await refresh();
    });

  if (!session) return <p className={styles.info}>{t.loading}</p>;

  if (session.authenticated) {
    const name = profile?.displayName ?? session.profile?.displayName ?? "";
    return (
      <section className={styles.panel}>
        <h1>{t.title}</h1>
        <p>{t.signedInAs(name)}</p>
        <form className={styles.form} onSubmit={saveProfile}>
          <label>
            {t.displayName}
            <input name="displayName" defaultValue={profile?.displayName ?? ""} maxLength={60} required />
          </label>
          <label>
            {t.handle}
            <input name="handle" defaultValue={profile?.handle ?? ""} pattern="[a-z0-9_-]{3,30}" maxLength={30} />
          </label>
          <label>
            {t.bio}
            <textarea name="bio" defaultValue={profile?.bio ?? ""} maxLength={500} rows={4} />
          </label>
          <label>
            {t.visibility}
            <select name="visibility" defaultValue={profile?.visibility ?? "public"}>
              <option value="public">{t.public}</option>
              <option value="private">{t.private}</option>
            </select>
          </label>
          <button className={styles.button} type="submit" disabled={busy}>{t.save}</button>
        </form>
        <button className={styles.secondary} type="button" onClick={logout} disabled={busy}>{t.signOut}</button>
        <Message text={message?.text ?? null} kind={message?.kind} />
      </section>
    );
  }

  const registrationOpen = registration === "open";
  return (
    <section className={styles.panel}>
      <h1>{t.title}</h1>
      <p className={styles.muted}>{t.intro}</p>
      <div className={styles.tabs} role="tablist">
        {(["login", "register", "forgot"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? styles.tabActive : styles.tab} onClick={() => { setTab(name); setMessage(null); }}>
            {t[name]}
          </button>
        ))}
      </div>
      {tab === "login" ? (
        enroll ? (
          <div className={styles.form}>
            <p>{t.enrollOffer}</p>
            <button className={styles.button} type="button" onClick={confirmEnroll} disabled={busy}>{t.enrollJoin}</button>
            <button className={styles.secondary} type="button" onClick={() => setEnroll(null)}>×</button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={login}>
            <label>
              {t.email}
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
            <label>
              {t.password}
              <input name="password" type="password" autoComplete="current-password" required maxLength={128} />
            </label>
            <button className={styles.button} type="submit" disabled={busy}>{t.login}</button>
          </form>
        )
      ) : null}
      {tab === "register" ? (
        registrationOpen ? (
          <form className={styles.form} onSubmit={register}>
            <p className={styles.muted}>{t.existingHint}</p>
            <label>
              {t.email}
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
            <label>
              {t.newPassword}
              <input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required />
            </label>
            <label>
              {t.displayName}
              <input name="displayName" required maxLength={60} />
            </label>
            <button className={styles.button} type="submit" disabled={busy}>{t.register}</button>
          </form>
        ) : (
          <Message kind="error" text={errorText(registration === "unavailable" ? "email-not-configured" : "registration-closed")} />
        )
      ) : null}
      {tab === "forgot" ? (
        <form className={styles.form} onSubmit={forgot}>
          <label>
            {t.email}
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <button className={styles.button} type="submit" disabled={busy}>{t.sendReset}</button>
        </form>
      ) : null}
      <Message text={message?.text ?? null} kind={message?.kind} />
    </section>
  );
}
