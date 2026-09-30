import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import styles from "./platformHeader.module.css";

export function PlatformHeader({
  data,
  lang,
  active = "home",
  showSearch = true,
  scopeLabel,
}: {
  data: PlatformHomeData;
  lang: Lang;
  active?: "home" | "search" | "patches" | "compare" | "game";
  showSearch?: boolean;
  scopeLabel?: string;
}) {
  const { nav } = data.labels;
  const prefix = lang === "ru" ? "/ru" : "";
  return (
    <header className={styles.header}>
      <Link className={styles.wordmark} href={prefix || "/"} aria-label="Gildra home">GILDRA</Link>
      {scopeLabel ? <span className={styles.scopeLabel}>◎ <span>{scopeLabel}</span><ChevronDown size={13} /></span> : null}
      <nav className={styles.nav} aria-label="Primary navigation">
        <Link className={active === "home" ? styles.navActive : ""} href={prefix || "/"}>{nav.home}</Link>
        <Link href={`${prefix}/talents/fury-warrior`}>{lang === "ru" ? "Спеки" : "Specs"}</Link>
        <Link className={active === "search" ? styles.navActive : ""} href={`${prefix}/search`}>{nav.search}</Link>
        <Link className={active === "patches" ? styles.navActive : ""} href={`${prefix}/patches`}>{nav.patchCenter}</Link>
        <Link className={active === "compare" ? styles.navActive : ""} href={`${prefix}/compare`}>{nav.comparisonLab}</Link>
      </nav>
      {showSearch ? (
        <form className={styles.search} action={`${prefix}/search`} role="search">
          <input name="q" aria-label={data.labels.searchPlaceholder} placeholder={data.labels.searchPlaceholder} />
          <button type="submit" aria-label={nav.search}><Search size={17} /></button>
        </form>
      ) : <span className={styles.headerSpacer} />}
      <Link className={styles.profileButton} href={`${prefix}/profile/arcanist`} aria-label={`${data.profile.name} profile`}>
        <span className={styles.avatar} aria-hidden="true">♜</span>
        <span>{data.profile.name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </Link>
    </header>
  );
}
