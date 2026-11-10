import Link from "next/link";
import { footerGroups } from "./footerLinks";
import styles from "./AtlasFrame.module.css";

export function FooterNavigation({ locale }: { locale: "en" | "ru" }) {
  return <>{footerGroups(locale).map(group => <details key={group.id} className={styles.footerGroup} data-footer-group={group.id}>
    <summary><h2>{group.title}</h2></summary>
    <ul>{group.links.map(link => <li key={link.href}><Link href={`${locale === "ru" ? "/ru" : ""}${link.href}`} prefetch={false}>{link.label[locale]}</Link></li>)}</ul>
  </details>)}</>;
}
