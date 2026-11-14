"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { AtlasError } from "@gildra/atlas-ui/AtlasState";
import { MaterialButton } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "../foreverKit";
import { ForeverFrame } from "../ForeverFrame";
import { ForeverHero } from "./ForeverHero";
import { ForeverPanel } from "./ForeverPanel";
import type { ForeverPageId } from "./foreverScenes";
import { sharedCopy } from "./sharedCopy";
import styles from "./forever.module.css";

/** The error page of a Forever route (error.tsx): the page's scene, its title and one panel with what to do. */
export function ForeverError({ lang, page, title, reset, children }: { lang: Lang; page: ForeverPageId; /** The page's name (the hero keeps it). */ title: ReactNode; reset: () => void; /** One sentence for the player, if the default does not fit. */ children?: ReactNode }) {
  const t = sharedCopy[lang];
  return <ForeverFrame lang={lang} page={page}>
    <ForeverHero lang={lang} title={title} />
    <ForeverPanel>
      <AtlasError className={styles.state} title={t.error} actions={<MaterialButton kit={FOREVER_KIT} onClick={reset} icon={<RotateCcw aria-hidden="true" />}>{t.retry}</MaterialButton>}>
        {children ?? t.errorText}
      </AtlasError>
    </ForeverPanel>
  </ForeverFrame>;
}
