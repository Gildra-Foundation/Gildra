import { getImageProps } from "next/image";
import styles from "./wowHome.module.css";

/** Dark background painting needs one physical pixel per CSS pixel, not a 2× phone image. */
export function HomeArtwork() {
  const common = { alt: "", fill: true, quality: 50, loading: "eager" as const, fetchPriority: "high" as const, decoding: "async" as const, className: styles.heroArt };
  const { props: wide } = getImageProps({ ...common, src: "/assets/wow/loading/wow-azeroth-vista-20261106.webp", sizes: "100vw" });
  const { props: portrait } = getImageProps({ ...common, src: "/assets/wow/loading/wow-azeroth-vista-20261106-portrait.webp", sizes: "100vw" });
  wide.srcSet = wide.srcSet?.split(", ").filter(src => Number(src.match(/ (\d+)w$/)?.[1]) <= 1200).join(", ");
  portrait.srcSet = portrait.srcSet?.split(", ").filter(src => Number(src.match(/ (\d+)w$/)?.[1]) <= 640).join(", ");
  return <>
    <link rel="preload" as="image" imageSrcSet={portrait.srcSet} imageSizes={portrait.sizes} fetchPriority="high" media="(max-width: 700px)" />
    <link rel="preload" as="image" imageSrcSet={wide.srcSet} imageSizes={wide.sizes} fetchPriority="high" media="(min-width: 701px)" />
    <picture><source media="(max-width: 700px)" srcSet={portrait.srcSet} sizes={portrait.sizes} />
      <img {...wide} alt="" />
    </picture>
  </>;
}
