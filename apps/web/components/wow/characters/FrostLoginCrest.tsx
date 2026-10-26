import Image from "next/image";
import styles from "./frostLogin.module.css";

/** Decorative steel and ice; the sign-in heading and action remain real HTML. */
export function FrostLoginCrest() {
  return <span className={styles.crest} aria-hidden="true">
    <Image src="/assets/wow/characters/frost-login/crest.webp" alt="" width={384} height={128} sizes="220px" />
  </span>;
}
