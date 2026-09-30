import styles from "./characterBookBackdrop.module.css";
import atmosphere from "./bookAtmosphere.module.css";

const artwork = "/assets/wow/character-book";
const characterRockTexture = `image-set(
  url("/_next/image?url=%2Fassets%2Fwow%2Fui-textures%2Fcharacter%2Fui-background-rock-optimized.webp&w=640&q=75") 1x,
  url("/_next/image?url=%2Fassets%2Fwow%2Fui-textures%2Fcharacter%2Fui-background-rock-optimized.webp&w=1920&q=75") 2x
)`;

/** Scene images live on rendered book elements, not shared stylesheets. */
export const characterWorldBackdropStyle = {
  "--gildra-character-world-base": `
    radial-gradient(ellipse 30% 72% at 4% 52%, #829eae36, transparent 88%),
    radial-gradient(ellipse 28% 70% at 96% 54%, #78977a2c, transparent 88%),
    radial-gradient(ellipse at 18% 32%, #4864772b, transparent 54%),
    radial-gradient(ellipse at 86% 66%, #3e555d27, transparent 52%),
    linear-gradient(180deg, #090e133b, #10191d0f 45%, #060b1131),
    url("${artwork}/outer-realm-backdrop-v1-optimized.webp") center 45% / cover no-repeat,
    ${characterRockTexture} center / 640px repeat,
    #080a0c`,
  "--gildra-character-world-base-mobile": `
    radial-gradient(ellipse 30% 72% at 4% 52%, #829eae36, transparent 88%),
    radial-gradient(ellipse 28% 70% at 96% 54%, #78977a2c, transparent 88%),
    radial-gradient(ellipse at 18% 32%, #4864772b, transparent 54%),
    radial-gradient(ellipse at 86% 66%, #3e555d27, transparent 52%),
    linear-gradient(180deg, #090e133b, #10191d0f 45%, #060b1131),
    url("${artwork}/outer-realm-backdrop-v1-mobile-optimized.webp") 24% 50% / auto 125% no-repeat,
    ${characterRockTexture} center / 440px repeat,
    #080a0c`,
} as React.CSSProperties;

/** Transparent, full-color character artwork blended into the shared realm
 * backdrop behind the physical book. */
export function CharacterBookBackdrop() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={atmosphere.backdrop} style={characterWorldBackdropStyle} />
      <div className={`${styles.figure} ${styles.frost}`}>
        <picture>
          <source
            type="image/avif"
            srcSet={`${artwork}/arthas-optimized-640-q60.avif 640w`}
            sizes="(max-width: 1222px) 440px, (max-width: 2000px) 36vw, 720px"
          />
          <source
            type="image/webp"
            srcSet={`${artwork}/arthas-optimized-640-q60.webp 640w`}
            sizes="(max-width: 1222px) 440px, (max-width: 2000px) 36vw, 720px"
          />
          <img
            className={styles.hero}
            src={`${artwork}/arthas-optimized-640-q60.webp`}
            width={1086}
            height={1448}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </picture>
      </div>

      <div className={`${styles.figure} ${styles.fel}`}>
        <picture>
          <source
            type="image/avif"
            srcSet={`${artwork}/illidan-optimized-640-q60.avif 640w`}
            sizes="(max-width: 1222px) 440px, (max-width: 2000px) 36vw, 720px"
          />
          <source
            type="image/webp"
            srcSet={`${artwork}/illidan-optimized-640-q60.webp 640w`}
            sizes="(max-width: 1222px) 440px, (max-width: 2000px) 36vw, 720px"
          />
          <img
            className={styles.hero}
            src={`${artwork}/illidan-optimized-640-q60.webp`}
            width={1086}
            height={1448}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </picture>
      </div>
      <div className={styles.vignette} />
    </div>
  );
}
