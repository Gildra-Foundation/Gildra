import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { mythicVerification } from "./mythicVerification";
import { mythicVerificationCopy, verificationDate } from "./mythicVerificationCopy";
import styles from "./mythicAtlasPage.module.css";

/** The hub's sources: one quiet disclosure with the date each fact was checked. */
export function MythicDataNotice({ locale }: { locale: "ru" | "en" }) {
  const copy = mythicVerificationCopy[locale];
  const sources = [
    { label: copy.season, title: copy.seasonSource, ...mythicVerification.season },
    { label: copy.timers, title: copy.timersSource, ...mythicVerification.timers },
    { label: copy.names, title: copy.namesSource, ...mythicVerification.names },
    { label: `${copy.patch}: ${mythicVerification.patch.value}`, title: copy.patchSource, ...mythicVerification.patch },
  ];
  return (
    <div className={styles.verification}>
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
        </dl>
      </AtlasDisclosure>
    </div>
  );
}
