import { SignatureGlyph } from "./SignatureGlyph";
import { SpecParticleCanvas } from "./SpecParticleCanvas";
import { SPEC_SIGNATURES } from "./signatures";
import styles from "./SpecSignatureFx.module.css";
import { SpecEmblem } from "../SpecEmblem";

export function SpecSignatureFx({ specSlug, appearance = "default" }: { specSlug: string; appearance?: "default" | "manuscript" }) {
  const signature = SPEC_SIGNATURES[specSlug];

  if (!signature) return null;
  return <div className={`${styles.scene}${appearance === "manuscript" ? ` ${styles.manuscript}` : ""}`} data-signature={specSlug} aria-hidden="true">
    <SpecParticleCanvas key={specSlug} specSlug={specSlug} type={signature.particles} />
    <svg className={styles.ward} viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="172" /><circle cx="200" cy="200" r="126" strokeDasharray="4 14" /><circle cx="200" cy="200" r="72" />
      <path d="M200 28V372M28 200H372M78 78L322 322M322 78L78 322" />
      <path d="M200 12L214 28L200 44L186 28ZM200 356L214 372L200 388L186 372ZM12 200L28 186L44 200L28 214ZM356 200L372 186L388 200L372 214Z" />
    </svg>
    {appearance === "manuscript" ? <SpecEmblem className={styles.engraving} specSlug={specSlug} size={180} /> : <>
      <span className={styles.primary}><SignatureGlyph name={signature.primary} /></span>
      <span className={styles.secondary}><SignatureGlyph name={signature.secondary} /></span>
    </>}
  </div>;
}
