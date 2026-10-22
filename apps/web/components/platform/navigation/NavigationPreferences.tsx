"use client";

import { useId, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { useSiteTheme } from "@/components/motion/SiteTheme";
import { homeThemes, isHomeTheme } from "@/components/platform/home/homeThemes";
import { gameDestinations, gameDestinationHref } from "@/lib/games/destinations";
import styles from "./atlasToolbar.module.css";

export function NavigationPreferences({ ru, onNavigate }: { ru: boolean; onNavigate: () => void }) {
  const id = useId();
  const lang = ru ? "ru" : "en";
  const { theme, selectTheme } = useSiteTheme();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className={styles.preferencesBody}>
    <label className={styles.preferenceLabel} htmlFor={id}>{ru ? "Оформление" : "Appearance"}</label>
    <AtlasValyroSelect id={id} value={theme} aria-busy={pending || undefined}
      options={homeThemes.map(item => ({ value: item.id, label: item[lang] }))}
      onValueChange={next => {
        if (!isHomeTheme(next)) return;
        selectTheme(next);
        startTransition(() => router.refresh());
      }} />
    <p className={styles.preferenceLabel}>{ru ? "Игры" : "Games"}</p>
    <nav className={styles.games} aria-label={ru ? "Игры" : "Games"}>
      {gameDestinations.map(game => <Link key={game.id} href={gameDestinationHref(game, lang)} prefetch={false} onClick={onNavigate}>
        <Image src={game.icon} width={24} height={24} alt="" />
        <span>{game.name}</span>
        {game.soon && <small>{ru ? "Скоро" : "Soon"}</small>}
      </Link>)}
    </nav>
  </div>;
}
