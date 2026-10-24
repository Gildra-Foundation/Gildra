import { routeSummary } from "@/lib/data/wow/mythicReviewSummary";
import type { MythicVerification } from "@/lib/data/gamecontent/types";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import { mythicVerification } from "./mythicVerification";
import { mythicVerificationCopy, verificationDate } from "./mythicVerificationCopy";
import styles from "./mythicAtlasPage.module.css";

export function MythicDataNotice({ locale, route = false, verification = mythicVerification, matchedRoutes }: { locale: "ru" | "en"; route?: boolean; verification?: MythicVerification; matchedRoutes?: number }) {
  const copy = mythicVerificationCopy[locale];
  const sources = [
    { label: copy.season, title: copy.season, ...verification.season },
    { label: copy.timers, title: copy.timers, ...verification.timers },
    { label: copy.names, title: copy.names, ...verification.names },
    { label: `${copy.patch}: ${verification.patch.value}`, title: copy.patch, ...verification.patch },
  ];
  return (
    <div className={styles.verification}>
      {route ? <AtlasNotice tone="caution" title={copy.routeTitle}>{copy.draft}</AtlasNotice> : <AtlasNotice tone="caution" title={copy.reviewedTitle}>
        {copy.reviewedSummary(matchedRoutes ?? Object.values(routeSummary).filter(r=>r.status === "dataset-matched").length)}
      </AtlasNotice>}
      <AtlasDisclosure summary={copy.summary}>
        <dl className={styles.sourceList}>
          {sources.map((source) => (
            <div key={source.label}>
              <dt>{source.label}</dt>
              <dd>
                <a href={source.source}>{source.title}</a>
                <span>{copy.checked}: <time dateTime={source.checkedAt}>{verificationDate(source.checkedAt, locale)}</time></span>
              </dd>
            </div>
          ))}
          <div><dt>{copy.route}</dt><dd>{copy.unverified}</dd></div>
        </dl>
        <p>{copy.scope}</p>
      </AtlasDisclosure>
    </div>
  );
}
