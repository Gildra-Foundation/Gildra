import type { HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const weaponIcons = {
  arthas: "arthas-frostmourne-v1",
  illidan: "illidan-warglaives-v1",
  garek: "garek-light-sword-v1",
  varok: "varok-double-axe-v2",
} as const satisfies Record<HomeThemeId, string>;
const iconPath = "/assets/wow/character-book/intro/theme-icons";

/** Transparent weapon art identifies each hero in the trigger and menu. */
export function ThemeEmblem({ theme }: { theme: HomeThemeId }) {
  const weapon = weaponIcons[theme];
  return <img className={styles.themeEmblem} data-hero-symbol={theme}
    src={`${iconPath}/${weapon}-96.webp`}
    srcSet={`${iconPath}/${weapon}-96.webp 1x, ${iconPath}/${weapon}-192.webp 2x`}
    width={48} height={48} alt="" aria-hidden="true" decoding="async" draggable={false} />;
}
