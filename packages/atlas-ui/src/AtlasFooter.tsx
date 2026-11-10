import type { ReactNode } from "react";
import { AtlasMotionToggle } from "./AtlasMotionToggle";
import styles from "./AtlasFooter.module.css";

/**
 * The site footer: brand and description, grouped navigation, language and motion
 * controls, then the legal notice. Pages outside the frame reuse it.
 */
export function AtlasFrameFooter({ locale, brand, description, legal, links, language, motion }: { locale: "en" | "ru"; legal: ReactNode; links: ReactNode; brand?: ReactNode; description?: ReactNode; language?: ReactNode; motion?: ReactNode }) {
  return <footer className={styles.legal} data-text-links>
    <div className={styles.inner}>
    <div className={styles.legalBody}>
      {brand || description ? <div className={styles.legalSummary}>
        {brand ? <div className={styles.legalBrand}>{brand}</div> : null}
        {description ? <p>{description}</p> : null}
      </div> : null}
      <nav aria-label={locale === "ru" ? "Навигация в подвале" : "Footer navigation"} className={styles.legalNav}>{links}</nav>
    </div>
    <div className={styles.legalMeta}>
      <div className={styles.legalControls}>{language}{motion ?? <AtlasMotionToggle locale={locale} />}</div>
      <p className={styles.legalNotice}>{legal}</p>
    </div>
    </div>
  </footer>;
}

