import Link from "next/link";
import { GildraCrest } from "@/components/brand/GildraCrest";
import { navigationRealms } from "@/components/platform/navigation/navigationMap";
import { rubySanctuaryCopy } from "./rubySanctuaryCopy";
import styles from "./rubySanctuaryFooter.module.css";

/** The concept's compact footer uses the site's real brand and navigation destinations. */
export function RubySanctuaryFooter({ locale }: { locale: "ru" | "en" }) {
  const prefix = locale === "ru" ? "/ru" : "", t = rubySanctuaryCopy[locale];
  return <footer className={styles.footer} data-testid="ruby-sanctuary-footer">
    <Link className={styles.brand} href={prefix || "/"} aria-label={t.home} prefetch={false}><GildraCrest height={32} /><span>GILDRA</span></Link>
    <nav aria-label={t.navigation}>{navigationRealms.map(realm => <Link key={realm.id} href={prefix + realm.links[0].href} prefetch={false}>{realm.label[locale]}</Link>)}</nav>
  </footer>;
}
