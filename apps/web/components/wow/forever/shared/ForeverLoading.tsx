import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n-paths";
import { ForeverFrame } from "../ForeverFrame";
import { ForeverHero } from "./ForeverHero";
import { ForeverPanel } from "./ForeverPanel";
import { ForeverSkeleton } from "./ForeverStates";
import type { ForeverPageId } from "./foreverScenes";

/** The loading page of a Forever route (loading.tsx): the page's scene, its title as a stand-in and the panel with a skeleton. */
export function ForeverLoading({ lang, page, title, variant = "rows", count = 6 }: { lang: Lang; page: ForeverPageId; title: ReactNode; variant?: "lines" | "cards" | "rows"; count?: number }) {
  return <ForeverFrame lang={lang} page={page}>
    <ForeverHero lang={lang} title={title} placeholder />
    <ForeverPanel><ForeverSkeleton lang={lang} variant={variant} count={count} /></ForeverPanel>
  </ForeverFrame>;
}
