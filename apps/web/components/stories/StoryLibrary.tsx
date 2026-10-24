import type { Metadata } from "next";
import type { Lang } from "@/lib/i18n-paths";
import { storyLibraryCopy } from "./storyLibraryCopy";
import styles from "./storyLibrary.module.css";

export function storyLibraryMetadata(lang: Lang): Metadata {
  const copy = storyLibraryCopy[lang];
  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: lang === "ru" ? "/ru/wow/stories" : "/wow/stories",
      languages: { en: "/wow/stories", ru: "/ru/wow/stories", "x-default": "/wow/stories" },
    },
  };
}

/** The supplied book uses document scroll, native dialogs and a 3D cover mesh.
 * A local reading frame preserves that renderer without leaking its global
 * styles or scroll locks into the shared toolbar and other application pages.
 */
export function StoryLibrary({ lang }: { lang: Lang }) {
  const copy = storyLibraryCopy[lang];
  return <main id="main-content" className={styles.library} aria-label={copy.label}>
    <iframe className={styles.room}
      src={lang === "ru" ? "/story-library/index.html" : "/story-library/en.html"}
      title={copy.frameTitle}
    />
  </main>;
}
