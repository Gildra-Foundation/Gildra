import Image from 'next/image';
import { SporefallAtmosphere } from './SporefallAtmosphere';
import styles from './sporefallPageBackdrop.module.css';

/** The environment remains behind the guide from its heading to its final sources. */
export function SporefallPageBackdrop() {
  return <div className={styles.backdrop} data-sporefall-page-art aria-hidden="true">
    <div className={styles.painting} data-sporefall-page-painting>
      <Image src="/assets/wow/raids/sporefall/scene.webp" alt="" fill sizes="100vw" quality={90} preload draggable={false} className={styles.image} />
    </div>
    <div className={styles.veil} />
    <SporefallAtmosphere />
  </div>;
}
