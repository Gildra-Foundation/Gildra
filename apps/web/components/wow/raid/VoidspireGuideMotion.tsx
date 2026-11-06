'use client';

import { useEffect, useRef } from 'react';
import { lessMotion, routeTurnActive, subscribeSiteMotion } from '@gildra/atlas-ui/motionPreference';

function milliseconds(value: string, fallback: number) {
  const match = /^(\d*\.?\d+)\s*(ms|s)$/.exec(value.trim());
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback;
}

/**
 * A brief illumination of the panels that come into view. What is on screen
 * already arrives with the page hand-over (first visit by a link) or with the
 * boss tab's own switch (AtlasTabs), so it lights up only on a fresh load.
 * Content and hit areas stay still.
 */
export function VoidspireGuideMotion({ encounter }: { encounter: string }) {
  const mounted = useRef(false);
  useEffect(() => {
    const firstArrival = !mounted.current && !routeTurnActive();
    mounted.current = true;
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
    let arrivals: IntersectionObserver | undefined;
    queueMicrotask(() => {
      if (disposed || reduced() || document.hidden || typeof HTMLElement.prototype.animate !== 'function') return;
      const css = getComputedStyle(root);
      const spring = css.getPropertyValue('--ui-spring-smooth').trim();
      const easing = spring && CSS.supports('animation-timing-function', spring) ? spring : css.getPropertyValue('--atlas-ease').trim() || 'ease-out';
      const duration = Math.min(520, milliseconds(css.getPropertyValue('--ui-duration-slow') || css.getPropertyValue('--atlas-duration-slow'), 320) * 1.36);
      const stagger = Math.min(60, milliseconds(css.getPropertyValue('--ui-motion-stagger'), 35));
      const reveal = (element: HTMLElement, index = 0) => {
        if (reduced() || element.contains(document.activeElement)) return;
        try {
          const animation = element.animate([{ opacity: .65 }, { opacity: 1 }], { duration, delay: Math.min(index, 2) * stagger, easing, fill: 'backwards' });
          animation.id = 'voidspire-arrive';
          running.push(animation);
        } catch {
          // Unsupported motion details leave the original content visible.
        }
      };
      if (typeof IntersectionObserver !== 'undefined') arrivals = new IntersectionObserver(entries => {
        entries.forEach(entry => { if (entry.isIntersecting) { arrivals?.unobserve(entry.target); reveal(entry.target as HTMLElement); } });
      });
      root.querySelectorAll<HTMLElement>('[data-guide-reveal]').forEach((element, index) => {
        if (!element.getClientRects().length) return;
        const bounds = element.getBoundingClientRect();
        if (bounds.top <= window.innerHeight && bounds.bottom >= 0) { if (firstArrival) reveal(element, index); }
        else if (bounds.top > window.innerHeight) arrivals?.observe(element);
      });
    });
    const release = () => root.querySelectorAll('[data-guide-pressed]').forEach(element => element.removeAttribute('data-guide-pressed'));
    const press = (event: KeyboardEvent) => {
      if ((event.key === ' ' || event.key === 'Enter') && event.target instanceof HTMLButtonElement && !event.target.disabled) event.target.setAttribute('data-guide-pressed', '');
    };
    const unsubscribe = subscribeSiteMotion(sync);
    const observer = new MutationObserver(sync);
    for (let element: HTMLElement | null = root; element; element = element.parentElement) observer.observe(element, {attributes:true,attributeFilter:['data-motion','data-ui-motion','data-transparency']});
    media.forEach(query => query.addEventListener('change', sync));
    root.addEventListener('pointerdown', stop);
    root.addEventListener('focusin', stop);
    root.addEventListener('keydown', press);
    root.addEventListener('keyup', release);
    root.addEventListener('focusout', release);
    return () => {
      disposed = true;
      stop();
      unsubscribe();
      observer.disconnect();
      arrivals?.disconnect();
      release();
      media.forEach(query => query.removeEventListener('change', sync));
      root.removeEventListener('pointerdown', stop);
      root.removeEventListener('focusin', stop);
      root.removeEventListener('keydown', press);
      root.removeEventListener('keyup', release);
      root.removeEventListener('focusout', release);
      delete root.dataset.guideMotion;
    };
  }, [encounter]);
  return null;
}
