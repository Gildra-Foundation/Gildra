import Image from 'next/image';
import { DreamriftAtmosphere } from './DreamriftAtmosphere';
import styles from './dreamriftPageBackdrop.module.css';

/** The environment remains behind the guide from its heading to its final sources. */
export function DreamriftPageBackdrop() {
  return <div className={styles.backdrop} data-dreamrift-page-art aria-hidden="true">
    <div className={styles.painting} data-dreamrift-page-painting>
      <Image src="/assets/wow/raids/midnight/backgrounds/the-dreamrift.png" alt="" fill sizes="100vw" quality={90} preload draggable={false} className={styles.image} />
    </div>
    <div className={styles.veil} />
    <DreamriftAtmosphere />
  </div>;
}
