"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { useHomeTheme } from "./HomeTheme";
import { homeThemes } from "./homeThemes";
import { useHomeScene } from "./HomeScene";
import styles from "./homeMusic.module.css";

export function HomeMusic({ lang }: { lang: Lang }) {
  const { theme } = useHomeTheme();
  const hero = homeThemes.find(item => item.id === theme)!;
  const ru = lang === "ru";
  const { volume, enabled, status, cinematic, toggle, changeVolume } = useHomeScene();
  const [cookieOffset, setCookieOffset] = useState(0);

  // Keep controls above the cookie notice without changing its existing behavior.
  useEffect(() => {
    const resize = new ResizeObserver(() => update());
    let notice: HTMLElement | null = null;
    const update = () => {
      const next = document.querySelector<HTMLElement>(".cookie");
      if (next !== notice) { if (notice) resize.unobserve(notice); notice = next; if (notice) resize.observe(notice); }
      setCookieOffset(notice ? Math.max(0, window.innerHeight - notice.getBoundingClientRect().top) : 0);
    };
    const mutation = new MutationObserver(update);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    update();
    return () => { resize.disconnect(); mutation.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const audible = enabled && volume > 0 && (status === "playing" || status === "loading");
  const label = cinematic
    ? (audible ? (ru ? "Выключить звук" : "Turn sound off") : (ru ? "Включить звук" : "Turn sound on"))
    : (audible ? (ru ? "Выключить музыку" : "Turn music off") : (ru ? "Включить музыку" : "Turn music on"));
  const Icon = !audible ? VolumeX : volume <= 35 ? Volume1 : Volume2;

  return <aside className={styles.music} aria-label={cinematic ? (ru ? "Звук сцены" : "Scene sound") : (ru ? "Фоновая музыка" : "Background music")}
    data-home-music data-music-theme={theme} data-music-status={status}
    style={{ "--music-offset": `${cookieOffset}px`, "--music-level": `${volume}%` } as CSSProperties}>
    <div className={styles.controls}>
      <button type="button" onClick={toggle} aria-label={label} title={label} aria-pressed={audible}>
        <Icon size={19} aria-hidden="true" />
      </button>
      <div className={styles.level}>
        <span className={styles.caption}>{cinematic ? (ru ? "Звук" : "Sound") : (ru ? "Музыка" : "Music")}<span aria-hidden="true"> · </span>{ru ? hero.ru : hero.en}</span>
        <input type="range" min={0} max={100} step={1} value={volume} onChange={event => changeVolume(Number(event.target.value))}
          aria-label={cinematic ? (ru ? "Громкость сцены" : "Scene volume") : (ru ? "Громкость музыки" : "Music volume")} aria-valuetext={`${volume}%`} />
      </div>
      <output className={styles.value} aria-hidden="true">{volume}%</output>
    </div>
    <span className={styles.status} role="status">
      {status === "blocked" ? (ru ? "Нажмите, чтобы включить" : "Press to play") : status === "error" ?
        (ru ? "Трек недоступен — попробуйте ещё раз" : "Track unavailable — try again") : ""}
    </span>
  </aside>;
}
