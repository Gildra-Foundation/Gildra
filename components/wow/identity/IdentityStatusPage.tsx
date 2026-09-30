import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import styles from "./identityStatusPage.module.css";

type Locale = "en" | "ru";
type IdentityLink = { href: string; label: string };

export function IdentityStatusPage({
  locale,
  eyebrow,
  title,
  summary,
  patch,
  season,
  sourceUrl,
  sourceLabel,
  lastVerifiedAt,
  links = [],
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  summary: string;
  patch: string;
  season: string;
  sourceUrl: string;
  sourceLabel: string;
  lastVerifiedAt: string;
  links?: IdentityLink[];
}) {
  const prefix = locale === "ru" ? "/ru" : "";
  return (
    <main className={styles.page}>
      <nav aria-label={locale === "ru" ? "Хлебные крошки" : "Breadcrumbs"}>
        <Link href={`${prefix}/wow`}>World of Warcraft</Link>
      </nav>
      <header>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{summary}</p>
      </header>
      <section className={styles.status} aria-labelledby="verification-status">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2 id="verification-status">{locale === "ru" ? "Опубликована только проверенная идентичность" : "Verified identity only"}</h2>
          <p>{locale === "ru"
            ? "Тактика, способности, игровые ID, иконки и добыча не публикуются как достоверные, пока не пройдут отдельную проверку."
            : "Strategy, abilities, game IDs, icons, and loot are not presented as authoritative until separately verified."}</p>
        </div>
      </section>
      <dl className={styles.facts}>
        <div><dt>Patch</dt><dd>{patch}</dd></div>
        <div><dt>Season</dt><dd>{season}</dd></div>
        <div><dt>{locale === "ru" ? "Статус" : "Status"}</dt><dd>identity_only</dd></div>
        <div><dt>{locale === "ru" ? "Проверено" : "Last verified"}</dt><dd>{lastVerifiedAt}</dd></div>
      </dl>
      {links.length ? <ul className={styles.links}>{links.map((link) => <li key={link.href}><Link href={`${prefix}${link.href}`}>{link.label}</Link></li>)}</ul> : null}
      <a className={styles.source} href={sourceUrl} target="_blank" rel="noreferrer">{sourceLabel}<ExternalLink aria-hidden="true" /></a>
    </main>
  );
}
