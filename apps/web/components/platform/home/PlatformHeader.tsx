import Link from "next/link";
import { ChevronDown, Search } from "lucide-react";
import type { PlatformHomeData } from "@/lib/platform/home/types";
import type { Lang } from "@/lib/i18n";
import { AccountChip } from "@/components/auth/AccountChip";
import { MVP_DEFERRED_PAGES_PUBLIC } from "@/lib/mvp";
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
        {/* Patch Center and Comparison Lab run on fixtures and are hidden for the WoW-only MVP (lib/mvp.ts). */}
        {MVP_DEFERRED_PAGES_PUBLIC ? <>
          <Link className={active === "patches" ? styles.navActive : ""} href={`${prefix}/patches`}>{nav.patchCenter}</Link>
          <Link className={active === "compare" ? styles.navActive : ""} href={`${prefix}/compare`}>{nav.comparisonLab}</Link>
        </> : null}
      </nav>
      {showSearch ? (
        <form className={styles.search} action={`${prefix}/search`} role="search">
          <input name="q" aria-label={data.labels.searchPlaceholder} placeholder={data.labels.searchPlaceholder} />
          <button type="submit" aria-label={nav.search}><Search size={17} /></button>
        </form>
      ) : <span className={styles.headerSpacer} />}
      <AccountChip
        lang={lang}
        className={styles.profileButton}
        avatarClassName={styles.avatar}
        labelClassName={styles.accountLabel}
        avatarContent="♜"
        trailing={<ChevronDown size={14} aria-hidden="true" />}
      />
    </header>
  );
}
