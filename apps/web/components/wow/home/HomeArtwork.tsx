import styles from "./wowHome.module.css";

const base = "/assets/wow/home/hero/azeroth";
const sources = (kind: "wide" | "portrait", format: "avif" | "webp") =>
  (kind === "wide" ? [768, 1200, 1672] : [384, 640, 847]).map(width => `${base}-${kind}-${width}.${format} ${width}w`).join(", ");

/** Pre-encoded derivatives of the approved painting: no first-request image transform. */
export function HomeArtwork() {
  return <>
    <link rel="preload" as="image" type="image/avif" imageSrcSet={sources("portrait", "avif")} imageSizes="100vw" fetchPriority="high" media="(max-width: 700px)" />
    <link rel="preload" as="image" type="image/avif" imageSrcSet={sources("wide", "avif")} imageSizes="100vw" fetchPriority="high" media="(min-width: 701px)" />
    <picture>
      <source media="(max-width: 700px)" type="image/avif" srcSet={sources("portrait", "avif")} sizes="100vw" />
      <source media="(max-width: 700px)" type="image/webp" srcSet={sources("portrait", "webp")} sizes="100vw" />
      <source type="image/avif" srcSet={sources("wide", "avif")} sizes="100vw" />
      <img src={`${base}-wide-1200.webp`} srcSet={sources("wide", "webp")} sizes="100vw" alt="" width={1672} height={941} fetchPriority="high" loading="eager" decoding="async" className={styles.heroArt} />
    </picture>
  </>;
}
