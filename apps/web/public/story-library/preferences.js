/* This local scene shares only motion preferences with its parent application. */
(() => {
  const system = matchMedia('(prefers-reduced-motion: reduce)');
  const parentRoot = window.parent.document.documentElement;
  window.libraryReducedMotion = () => system.matches || parentRoot.dataset.motion === 'reduced';
  const sync = () => {
    document.documentElement.toggleAttribute('data-library-still', window.libraryReducedMotion());
    if (window.libraryReducedMotion()) window.libraryJourney?.settle();
  };
  new MutationObserver(sync).observe(parentRoot, {attributes: true, attributeFilter: ['data-motion']});
  system.addEventListener('change', sync);
  sync();
})();
