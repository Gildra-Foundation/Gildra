import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import { mythicVerification } from "./mythicVerification";
import { mythicVerificationCopy, verificationDate } from "./mythicVerificationCopy";
import styles from "./mythicAtlasPage.module.css";

export function MythicDataNotice({ locale, route = false }: { locale: "ru" | "en"; route?: boolean }) {
  const copy = mythicVerificationCopy[locale];
  const sources = [
    { label: copy.season, title: copy.seasonSource, ...mythicVerification.season },
    { label: copy.timers, title: copy.timersSource, ...mythicVerification.timers },
    { label: copy.names, title: copy.namesSource, ...mythicVerification.names },
    { label: `${copy.patch}: ${mythicVerification.patch.value}`, title: copy.patchSource, ...mythicVerification.patch },
  ];
  return (
    <div className={styles.verification}>
      {route && <AtlasNotice tone="caution" title={locale === "ru" ? "Черновик маршрута" : "Draft route"}>{locale === "ru" ? "Изменения авторского маршрута не проверены." : "Custom route changes have not been verified."}</AtlasNotice>}
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
          <div><dt>{copy.route}</dt><dd>{copy.reviewed}<span>{copy.checked}: <time dateTime={mythicVerification.route.checkedAt}>{verificationDate(mythicVerification.route.checkedAt, locale)}</time></span></dd></div>
        </dl>
        <p>{copy.scope}</p>
      </AtlasDisclosure>
    </div>
  );
}
