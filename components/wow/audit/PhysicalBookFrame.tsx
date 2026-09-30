import styles from "./physicalBookFrame.module.css";

function material(file: string, widths: readonly [number, number]) {
  const src = file.startsWith("/") ? file : `/assets/wow/character-book/${file}`;
  // These fixed 1×/2× pairs mirror the default Next image widths without parsing eleven srcSets at client startup.
  const optimized = (width: number) => `url("/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75")`;
  return `image-set(${optimized(widths[0])} 1x, ${optimized(widths[1])} 2x)`;
}

/** Use the same optimized material URLs in the shell and nested paper panels. */
export const physicalBookMaterials = {
  "--book-rock-texture-image": material("/assets/wow/ui-textures/character/ui-background-rock-optimized.webp", [640, 1920]),
  "--book-binding-image": material("folio-binding-v1-optimized.webp", [828, 1920]),
  "--book-binding-image-mobile": material("folio-binding-v1-optimized.webp", [384, 828]),
  "--book-paper-image": material("folio-vellum-v1-optimized.webp", [640, 1920]),
  "--book-edge-image": material("folio-fore-edge-v1-optimized.webp", [256, 640]),
  "--book-edge-image-mobile": material("folio-fore-edge-v1-optimized.webp", [96, 256]),
  "--folio-ornament-frame": material("grimoire-frame-v1-optimized.webp", [384, 828]),
  "--folio-control-image": material("grimoire-button-v1-optimized.webp", [384, 828]),
  "--folio-medallion": material("grimoire-medallion-v1-optimized.webp", [96, 256]),
  "--folio-action-endcap": material("grimoire-gryphon-v1-optimized.webp", [256, 384]),
  "--folio-action-slot": material("grimoire-socket-v1-optimized.webp", [96, 256]),
  "--folio-divider-image": material("grimoire-divider-v1-optimized.webp", [384, 640]),
  "--folio-engraving-atlas": material("grimoire-engravings-v1-optimized.webp", [384, 640]),
};

/** Independent, non-interactive book materials; never mask the live controls. */
export function PhysicalBookFrame() {
  return <div className={styles.volume} aria-hidden="true">
    <div className={styles.paper} />
    <div className={`${styles.edge} ${styles.left}`} />
    <div className={`${styles.edge} ${styles.right}`} />
    <div className={styles.binding} />
    <div className={styles.gutter} />
  </div>;
}
