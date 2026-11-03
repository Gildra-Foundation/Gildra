'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import { lessMotion, subscribeSiteMotion } from '@gildra/atlas-ui/motionPreference';
import styles from './voidspirePageBackdrop.module.css';

// Stable positions render identically on the server and the client.
const motes = Array.from({ length: 12 }, (_, index) => ({
  x: 5 + (index * 23.7) % 90,
  y: 8 + (index * 31.3) % 84,
  duration: 14 + index % 5 * 3,
  delay: -(index * 2.7),
}));

/** Viewport-sized CSS mist and drifting sparks, behind all interactive content. */
export function VoidspireAtmosphere() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let visible = typeof IntersectionObserver === 'undefined';
    const media = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(forced-colors: active)'].map(query => matchMedia(query));
    const sync = () => {
      const reduced = lessMotion() || media.some(query => query.matches)
        || !!root.closest('[data-motion="reduced"], [data-ui-motion="reduce"], [data-transparency="reduced"]');
      root.dataset.atmosphereState = reduced ? 'static' : visible && !document.hidden ? 'active' : 'paused';
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    });
    observer?.observe(root);
    const attributes = new MutationObserver(sync);
    for (let element: HTMLElement | null = root; element; element = element.parentElement) {
      attributes.observe(element, { attributes: true, attributeFilter: ['data-motion', 'data-ui-motion', 'data-transparency'] });
    }
    const unsubscribe = subscribeSiteMotion(sync);
    media.forEach(query => query.addEventListener('change', sync));
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      observer?.disconnect();
      attributes.disconnect();
      unsubscribe();
      media.forEach(query => query.removeEventListener('change', sync));
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return <div ref={ref} className={styles.atmosphere} data-guide-atmosphere data-atmosphere-state="paused" aria-hidden="true">
    <div className={styles.mist} data-atmosphere-mist />
    <div className={`${styles.mist} ${styles.farMist}`} data-atmosphere-mist />
    <div className={styles.motes}>
      {motes.map((mote, index) => <i key={index} style={{
        '--mote-x': `${mote.x}%`, '--mote-y': `${mote.y}%`,
        '--mote-duration': `${mote.duration}s`, '--mote-delay': `${mote.delay}s`,
      } as CSSProperties} />)}
    </div>
  </div>;
}
