(() => {
  if (location.pathname !== "/" && location.pathname !== "/ru" && location.pathname !== "/ru/") return;

  let observer;
  const restore = (link) => {
    link.media = "all";
    observer?.disconnect();
  };
  const deferRootStylesheet = () => {
    document.querySelectorAll('link[rel="stylesheet"][data-precedence*="root-of-the-server"]').forEach((link) => {
      if (link.dataset.homeCssDeferred) return;
      link.dataset.homeCssDeferred = "true";
      link.addEventListener("load", () => restore(link), { once: true });
      link.addEventListener("error", () => restore(link), { once: true });
      link.media = "print";
      try {
        if (link.sheet?.cssRules.length) restore(link);
      } catch {
        restore(link);
      }
    });
  };
  const restoreOnInteraction = () => {
    document.querySelectorAll('link[data-home-css-deferred="true"]').forEach((link) => {
      restore(link);
    });
  };

  observer = new MutationObserver(deferRootStylesheet);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  deferRootStylesheet();
  window.addEventListener("pointerdown", restoreOnInteraction, { capture: true, once: true });
  window.addEventListener("keydown", restoreOnInteraction, { capture: true, once: true });
})();
