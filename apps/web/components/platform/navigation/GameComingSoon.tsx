import { ArrowRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import type { UpcomingGame } from "@/lib/games/destinations";
import { p, type Lang } from "@/lib/i18n-paths";
import { gameComingSoonCopy as copy } from "./gameComingSoonCopy";
import styles from "./gameComingSoon.module.css";

export function GameComingSoon({ game, lang }: { game: UpcomingGame; lang: Lang }) {
  return <AtlasFrame lang={lang} footer={false} still className={styles.page}
    art={game.art}
    artPosition="center 35%" artShade="deep">
    <AtlasHero align="center" title={game.name} eyebrow={copy[lang].eyebrow} lede={copy[lang].description}
      actions={<AtlasLinkButton href={p(lang, "/wow")} iconAfter={<ArrowRight size={16} aria-hidden="true" />}>{copy[lang].back}</AtlasLinkButton>} />
  </AtlasFrame>;
}
