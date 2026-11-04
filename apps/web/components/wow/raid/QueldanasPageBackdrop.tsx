import Image from 'next/image';
import { QueldanasAtmosphere } from './QueldanasAtmosphere';
import styles from './queldanasPageBackdrop.module.css';

/** The environment remains behind the guide from its heading to its final sources. */
export function QueldanasPageBackdrop() {
  return <div className={styles.backdrop} data-queldanas-page-art aria-hidden="true">
    <div className={styles.painting} data-queldanas-page-painting>
      <Image src="/assets/wow/raids/midnight/backgrounds/march-on-queldanas.png" alt="" fill sizes="100vw" quality={90} preload draggable={false} className={styles.image} />
    </div>
    <div className={styles.veil} />
    <QueldanasAtmosphere />
  </div>;
}
