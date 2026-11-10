import styles from "./wowHome.module.css";

/** Real product media, not another decorative scene; native AVIF/WebP with no client code. */
export function HomePreview({ kind, alt }: { alt: string; kind: "ruby-route" | "venomous-abyss" | "professions" }) {
  const path = `/assets/wow/home/light/${kind}`;
  return <picture>
    <source type="image/avif" srcSet={`${path}-384.avif 384w, ${path}-768.avif 768w`} sizes="(max-width: 700px) calc(100vw - 28px), (max-width: 1280px) calc(50vw - 38px), 602px" />
    <img src={`${path}-768.webp`} srcSet={`${path}-384.webp 384w, ${path}-768.webp 768w`} sizes="(max-width: 700px) calc(100vw - 28px), (max-width: 1280px) calc(50vw - 38px), 602px" width={768} height={512} alt={alt} loading="lazy" decoding="async" fetchPriority="low" className={styles.previewImage} />
  </picture>;
}
