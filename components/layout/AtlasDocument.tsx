import type { ReactNode } from "react";
import styles from "./atlasDocument.module.css";

export function AtlasDocument({ lang, children }: { lang: "en" | "ru"; children: ReactNode }) {
  return <main className={styles.document} lang={lang} data-atlas-document>{children}</main>;
}
