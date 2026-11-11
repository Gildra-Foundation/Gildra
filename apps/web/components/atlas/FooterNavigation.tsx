import { foreverRealms, linksFor } from "@/components/platform/navigation/navigationMap";
import Link from "next/link";
import { p } from "@/lib/i18n-paths";
import { footerGroups } from "./footerLinks";
import styles from "./AtlasFrame.module.css";

export function FooterNavigation({ locale, forever = false }: { locale: "en" | "ru"; forever?: boolean }) {
  const groups = forever ? [
    { id: "forever", title: "Forever", links: foreverRealms.flatMap(realm => linksFor(realm, locale)) },
    ...footerGroups(locale).filter(group => group.id === "versions" || group.id === "site"),
  ] : footerGroups(locale);
  return <>{groups.map(group => <details key={group.id} className={styles.footerGroup} data-footer-group={group.id}>
    <summary><h2>{group.title}</h2></summary>
    <ul>{group.links.map(link => <li key={link.href}><Link href={p(locale, link.href)} prefetch={false}>{link.label[locale]}</Link></li>)}</ul>
  </details>)}</>;
}
