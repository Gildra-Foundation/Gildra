import styles from "./grimoireHome.module.css";

/** A compact crown and angular G rune, drawn for the homepage wordmark. */
export function GildraMark() {
  return <svg className={styles.brandMark} viewBox="0 0 64 72" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="home-gildra-metal" x1="12" y1="6" x2="51" y2="65" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--bright)" /><stop offset=".42" stopColor="var(--metal)" /><stop offset=".68" stopColor="var(--paper)" /><stop offset="1" stopColor="var(--metal-dark)" />
      </linearGradient>
      <linearGradient id="home-gildra-core" x1="32" y1="4" x2="32" y2="67" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--button-top)" /><stop offset="1" stopColor="var(--button-bottom)" />
      </linearGradient>
    </defs>
    <path d="M9 30 5 12l18 12L32 4l9 20 18-12-4 30-23 25L9 43V30Z" fill="url(#home-gildra-core)" stroke="url(#home-gildra-metal)" strokeWidth="1.5" />
    <path d="m5 12 15 20-11-2m50-18L44 32l11-2M32 4v17M9 43l13-2m33 1-13-1M32 57v10" stroke="url(#home-gildra-metal)" strokeWidth="1" opacity=".75" />
    <path d="m41 31-9-6-12 9v12l12 10 12-10V38H32v5h7v1l-7 6-6-6v-7l6-5 6 4 3-5Z" fill="url(#home-gildra-metal)" />
    <path d="m32 10 2.5 8L32 23l-2.5-5L32 10Z" fill="var(--bright)" />
    <path d="m13 20 4 8m34-8-4 8" stroke="var(--accent)" strokeLinecap="round" />
  </svg>;
}
