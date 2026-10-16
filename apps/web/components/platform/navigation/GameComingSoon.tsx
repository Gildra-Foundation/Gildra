import { ArrowLeft } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import type { UpcomingGame } from "@/lib/games/destinations";
import type { Lang } from "@/lib/i18n-paths";
import { gameComingSoonCopy as copy } from "./gameComingSoonCopy";
import styles from "./gameComingSoon.module.css";

export function GameComingSoon({ game, lang }: { game: UpcomingGame; lang: Lang }) {
  return <AtlasFrame lang={lang} footer={false} still className={styles.page}
    art={game.art}
    artPosition="center 35%" artShade="deep">
    <AtlasHero align="center" title={game.name} eyebrow={<span lang="en">Coming soon</span>} lede={copy[lang].description}
      actions={<AtlasLinkButton href={lang === "ru" ? "/ru" : "/"} icon={<ArrowLeft size={16} aria-hidden="true" />}>{copy[lang].back}</AtlasLinkButton>} />
  </AtlasFrame>;
}
