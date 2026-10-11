import { AtlasLinkButton, AtlasNotice } from "@/components/atlas";
import { libraryCopy } from "@/components/library/libraryCopy";
import styles from "./library.module.css";

type Props = { lang: "en" | "ru"; href?: string };

/** Honest outage state of the library: nothing was deleted, the publication is closed for now. */
export function LibraryUnavailable({ lang, href }: Props) {
  const copy = libraryCopy[lang];
  const next = href ?? (lang === "ru" ? "/ru/library" : "/library");
  return (
    <div className={styles.unavailable} role="alert">
      <AtlasNotice tone="caution" title={copy.unavailableTitle}
        action={<AtlasLinkButton href={`/api-console?next=${encodeURIComponent(next)}`} prefetch={false} size="sm" variant="ghost">{copy.openConsole}</AtlasLinkButton>}>
        {copy.unavailableText}
      </AtlasNotice>
    </div>
  );
}
