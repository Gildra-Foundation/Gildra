'use client';

import { useEffect } from 'react';
import { lessMotion, subscribeSiteMotion } from '@gildra/atlas-ui/motionPreference';

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback;
}

/** A short Valyro-spring arrival when the encounter changes. Content is never hidden. */
export function VoidspireGuideMotion({ encounter }: { encounter: string }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-voidspire-guide]');
    if (!root) return;
    const media = ['(prefers-reduced-motion: reduce)', '(prefers-reduced-transparency: reduce)', '(forced-colors: active)'].map(query => window.matchMedia(query));
    const reduced = () => lessMotion() || media.some(query => query.matches) || !!root.closest('[data-motion="reduced"], [data-ui-motion="reduce"], [data-transparency="reduced"]');
    const running: Animation[] = [];
    const stop = () => {
      running.forEach(animation => animation.cancel());
      if (reduced()) root.querySelectorAll('[data-flip-id]').forEach(element => element.getAnimations().filter(animation => animation.id === 'ui-flip').forEach(animation => animation.cancel()));
    };
    const sync = () => { root.dataset.guideMotion = reduced() ? 'static' : 'ready'; if (reduced()) stop(); };
    sync();
    let disposed = false;
    queueMicrotask(() => {
      if (disposed || reduced() || document.hidden || typeof HTMLElement.prototype.animate !== 'function') return;
      const css = getComputedStyle(root);
      const spring = css.getPropertyValue('--ui-spring-smooth').trim();
      const easing = spring && CSS.supports('animation-timing-function', spring) ? spring : css.getPropertyValue('--atlas-ease').trim() || 'ease-out';
      const duration = Math.min(420, milliseconds(css.getPropertyValue('--ui-duration-slow') || css.getPropertyValue('--atlas-duration-slow'), 320));
      const stagger = Math.min(60, milliseconds(css.getPropertyValue('--ui-motion-stagger'), 35));
      root.querySelectorAll<HTMLElement>('[data-guide-reveal]').forEach((element, index) => {
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom < 0 || bounds.top > window.innerHeight || element.contains(document.activeElement)) return;
        try {
          const animation = element.animate([{ opacity: .88, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration, delay: Math.min(index, 2) * stagger, easing, fill: 'backwards' });
          animation.id = 'voidspire-arrive';
          running.push(animation);
        } catch {
          // Unsupported motion details leave the original content visible.
        }
      });
    });
    const unsubscribe = subscribeSiteMotion(sync);
    const observer = new MutationObserver(sync);
    for (let element: HTMLElement | null = root; element; element = element.parentElement) observer.observe(element, {attributes:true,attributeFilter:['data-motion','data-ui-motion','data-transparency']});
    media.forEach(query => query.addEventListener('change', sync));
    root.addEventListener('pointerdown', stop);
    root.addEventListener('focusin', stop);
    return () => {
      disposed = true;
      stop();
      unsubscribe();
      observer.disconnect();
      media.forEach(query => query.removeEventListener('change', sync));
      root.removeEventListener('pointerdown', stop);
      root.removeEventListener('focusin', stop);
      delete root.dataset.guideMotion;
    };
  }, [encounter]);
  return null;
}
