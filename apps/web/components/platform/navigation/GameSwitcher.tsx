"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useId, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { gameDestinationForPath, gameDestinationHref, gameDestinations } from "@/lib/games/destinations";
import type { Lang } from "@/lib/i18n-paths";
import styles from "./gameSwitcher.module.css";

export function GameSwitcher({ lang, pathname = "/", home = false }: { lang: Lang; pathname?: string; home?: boolean }) {
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const id = useId();
  const current = gameDestinationForPath(pathname);
  const ru = lang === "ru";

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target) && root.current) root.current.open = false;
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  // Native disclosure works before hydration; preserve a reader's early click.
  return <details ref={root} suppressHydrationWarning className={`${styles.root}${home ? ` ${styles.home}` : ""}`} data-atlas-scope data-game-switcher
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={event => {
      if (event.key === "Escape" && root.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        root.current.open = false;
        trigger.current?.focus();
      }
    }}>
    <summary ref={trigger} className={styles.trigger} aria-label={`${ru ? "Выбрать игру" : "Choose game"}: ${current.name}`} aria-controls={id}>
      <span className={styles.identity}>
        <span className={styles.brand}>GILDRA</span>
        <span className={styles.current}><span className={styles.fullName}>{current.name}</span><span className={styles.shortName}>{current.shortName}</span></span>
      </span>
      <ChevronDown size={14} aria-hidden="true" />
    </summary>
    <nav id={id} className={styles.panel} aria-label={ru ? "Выбор игры" : "Game selection"}>
      <p className={styles.caption}>{ru ? "Игры Gildra" : "Gildra games"}</p>
      <ul>
        {gameDestinations.map(game => <li key={game.id}>
          <Link href={gameDestinationHref(game, lang)} prefetch={false} className={styles.choice} aria-current={game.id === current.id ? "page" : undefined}
            onClick={() => { if (root.current) root.current.open = false; }}>
            <Image src={game.icon} width={32} height={32} alt="" />
            <span className={styles.choiceText}><span>{game.name}</span>{game.soon && <small lang="en">Coming soon</small>}</span>
            {game.id === current.id && <Check size={16} aria-hidden="true" />}
          </Link>
        </li>)}
      </ul>
    </nav>
  </details>;
}
