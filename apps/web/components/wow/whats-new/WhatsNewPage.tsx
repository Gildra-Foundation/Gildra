import { AtlasBadge, AtlasFrame, AtlasHero, AtlasSection, formatAtlasDate, type AtlasBadgeTone } from "@/components/atlas";
import { changelog, type ChangeKind } from "./changelog";
import { whatsNewCopy } from "./whatsNewCopy";
import styles from "./whatsNew.module.css";
import { trail } from "@/lib/routes/registry";

const tone: Record<ChangeKind, AtlasBadgeTone> = { new: "accent", better: "info", fixed: "positive" };

/** Player-facing changelog of the site (roadmap item 99). */
export function WhatsNewPage({ locale }: { locale: "en" | "ru" }) {
  const copy = whatsNewCopy[locale];
  return (
    <AtlasFrame lang={locale} scene="articles">
      <AtlasHero
        breadcrumbs={trail(locale, "whatsNew")}
        breadcrumbsLabel={copy.breadcrumbs}
        title={copy.title}
        lede={copy.lede}
      />
      {changelog.map((release) => (
        <AtlasSection key={release.date} id={`release-${release.date}`} title={formatAtlasDate(release.date, locale)}>
          <div className={styles.release}>
            <ul className={styles.changes}>
              {release.changes.map((change) => (
                <li key={change.en} className={styles.change}>
                  <AtlasBadge tone={tone[change.kind]} className={styles.kind}>{copy.kinds[change.kind]}</AtlasBadge>
                  <span className={styles.text}>{change[locale]}</span>
                </li>
              ))}
            </ul>
          </div>
        </AtlasSection>
      ))}
    </AtlasFrame>
  );
}
