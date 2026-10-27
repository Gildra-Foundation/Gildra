import type { Metadata } from "next";
import { AtlasLegalFooter } from "@/components/atlas";
import { storyLibraryCopy as copy } from "./storyLibraryCopy";
import styles from "./storyLibrary.module.css";

export function storyLibraryMetadata(): Metadata {
  return {
    title: copy.title,
    description: copy.description,
    // The manuscript exists only in Russian (lib/routes/registry.ts `only`); the English URL redirects here.
    alternates: { canonical: "/ru/wow/stories" },
  };
}

/** The supplied book uses document scroll, native dialogs and a 3D cover mesh.
 * A local reading frame preserves that renderer without leaking its global
 * styles or scroll locks into the shared toolbar and other application pages.
 * The page's heading and the site's legal line stay in this document.
 */
export function StoryLibrary() {
  return <main id="main-content" className={styles.library} lang="ru">
    <h1 className={styles.srOnly}>{copy.heading}</h1>
    <iframe className={styles.room} src="/story-library/index.html" title={copy.frameTitle} />
    <div className={styles.footer}><AtlasLegalFooter lang="ru" /></div>
  </main>;
}
