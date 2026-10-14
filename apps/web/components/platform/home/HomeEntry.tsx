"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { readBrowserConsent, saveBrowserConsent, type BrowserConsent } from "@/lib/browserConsent";
import { useHomeScene } from "./HomeScene";
import { EntryTextActions } from "./EntryTextActions";
import styles from "./homeEntry.module.css";

export function HomeEntry({ lang }: { lang: Lang }) {
  const ru = lang === "ru";
  const { started, entryReady, confirmSound } = useHomeScene();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consent, setConsent] = useState<BrowserConsent>("declined");
  const [soundChoice, setSoundChoice] = useState<boolean | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const open = entryReady && (!started || settingsOpen);

  useEffect(() => {
    if (!open) return;
    if (!started) setConsent(readBrowserConsent() ?? "declined");
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    title.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, lang, started]);

  function finish(enabled: boolean) {
    saveBrowserConsent(consent);
    confirmSound(enabled);
    setSettingsOpen(false);
    // The persistent sound control is the next useful action after entry.
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-home-music] button")?.focus({ preventScroll: true }));
  }
  function closeSettings() {
    setSettingsOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  function changeConsent(value: BrowserConsent) {
    setConsent(value);
    // Preserve an explicit entry choice when switching to the other language.
    if (!started) saveBrowserConsent(value);
  }

  return <>
    {started && <button ref={trigger} className={styles.settingsTrigger} type="button" aria-haspopup="dialog" onClick={() => {
      setConsent(readBrowserConsent() ?? "declined");
      setSettingsOpen(true);
    }}>
      {ru ? "Настройки файлов cookie" : "Cookie settings"}
    </button>}
    <dialog ref={dialog} className={styles.dialog} lang={lang} aria-labelledby="home-entry-title" aria-describedby={started ? undefined : "home-entry-description"} data-home-entry
      onCancel={event => { event.preventDefault(); if (started) closeSettings(); }}>
      <div className={styles.topline}>
        <span>GILDRA <span aria-hidden="true"> / </span> {ru ? "ХРОНИКИ АЗЕРОТА" : "CHRONICLES OF AZEROTH"}</span>
        <nav className={styles.language} aria-label={ru ? "Язык сайта" : "Site language"}>
          <Link href="/ru" prefetch={false} aria-current={ru ? "page" : undefined} lang="ru">{ru ? "Русский" : "Russian"}</Link>
          <Link href="/" prefetch={false} aria-current={!ru ? "page" : undefined} lang="en">{ru ? "Английский" : "English"}</Link>
        </nav>
        {started && <button className={styles.close} type="button" aria-label={ru ? "Закрыть настройки" : "Close settings"} onClick={closeSettings}><X size={20} /></button>}
      </div>
      <h2 ref={title} id="home-entry-title" tabIndex={-1}>{started ? (ru ? "Настройки файлов cookie" : "Cookie settings") : (ru ? "Прежде чем открыть хроники" : "Before the chronicles begin")}</h2>
      {!started && <>
        <p id="home-entry-description" className={styles.description}>{ru
          ? "Вступительная сцена содержит музыку и озвученные реплики. Для лучшего погружения рекомендуем включить звук. Вы сможете выключить его или изменить громкость в любой момент."
          : "The opening scene includes music and spoken dialogue. We recommend sound for a more immersive experience. You can turn it off or adjust the volume at any time."}</p>
        <p className={styles.waiting}>{ru ? "Выберите звук и нажмите «Продолжить» — тогда начнётся вступительная сцена." : "Choose your sound setting and press Continue to begin the opening scene."}</p>
      </>}
      <fieldset className={styles.cookies}>
        <legend>{ru ? "Файлы cookie" : "Cookies"}</legend>
        <p>{ru ? "Необходимое хранилище сохраняет настройки сайта и ваш выбор. Необязательная статистика помогает улучшать Gildra." : "Necessary storage saves site preferences and your choice. Optional usage statistics help us improve Gildra."}</p>
        <div className={styles.cookieChoices}>
          <label><input type="radio" name="home-consent" value="declined" checked={consent === "declined"} onChange={() => changeConsent("declined")} />{ru ? "Только необходимые" : "Necessary only"}</label>
          <label><input type="radio" name="home-consent" value="accepted" checked={consent === "accepted"} onChange={() => changeConsent("accepted")} />{ru ? "Разрешить статистику" : "Allow usage statistics"}</label>
        </div>
        <Link className={styles.privacy} href={ru ? "/ru/privacy" : "/privacy"} prefetch={false} target="_blank" rel="noopener noreferrer">{ru ? "Политика конфиденциальности (новая вкладка)" : "Privacy policy (new tab)"}</Link>
      </fieldset>
      {!started && <div role="radiogroup" aria-label={ru ? "Звук вступления" : "Opening sound"} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]'));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = (index + 1) % buttons.length;
        setSoundChoice(next === 0);
        buttons[next].focus();
      }}>
        <EntryTextActions>
          <button type="button" role="radio" aria-checked={soundChoice === true} tabIndex={soundChoice === false ? -1 : 0} className={styles.withSound} onClick={() => setSoundChoice(true)}><span data-entry-label>{ru ? "Включить звук" : "Enable sound"}</span><small>{ru ? "Рекомендуем" : "Recommended"}</small></button>
          <button type="button" role="radio" aria-checked={soundChoice === false} tabIndex={soundChoice === false ? 0 : -1} className={styles.withoutSound} onClick={() => setSoundChoice(false)}><span data-entry-label>{ru ? "Без звука" : "Without sound"}</span></button>
        </EntryTextActions>
      </div>}
      <div className={styles.confirm}>
        <EntryTextActions>
          <button type="button" className={styles.withSound} disabled={!started && soundChoice === null} onClick={() => {
            if (started) { saveBrowserConsent(consent); closeSettings(); }
            else if (soundChoice !== null) finish(soundChoice);
          }}><span data-entry-label>{started ? (ru ? "Сохранить настройки" : "Save preferences") : (ru ? "Продолжить" : "Continue")}</span></button>
        </EntryTextActions>
      </div>
      <p className={styles.footnote}>{!started && soundChoice === null
        ? (ru ? "Сначала выберите: со звуком или без звука." : "First choose whether to enable sound.")
        : (ru ? "Выбранные настройки сохранятся при продолжении." : "Your selected preferences will be saved when you continue.")}</p>
    </dialog>
  </>;
}
