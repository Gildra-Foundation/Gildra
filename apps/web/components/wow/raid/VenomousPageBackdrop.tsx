import Image from 'next/image';
import { VenomousAtmosphere } from './VenomousAtmosphere';
import styles from './venomousPageBackdrop.module.css';

/** The environment remains behind the guide from its heading to its final sources. */
export function VenomousPageBackdrop() {
  return <div className={styles.backdrop} data-venomous-page-art aria-hidden="true">
    <div className={styles.painting} data-venomous-page-painting>
      <Image src="/assets/wow/raids/hub/vault.webp" alt="" fill sizes="100vw" quality={90} preload draggable={false} className={styles.image} />
    </div>
    <div className={styles.veil} />
    <VenomousAtmosphere />
  </div>;
}
