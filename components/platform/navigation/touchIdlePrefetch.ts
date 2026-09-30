export function scheduleTouchIdlePrefetch(prefetch: () => void) {
  if (typeof window === "undefined" || !window.matchMedia("(hover: none)").matches) return () => {};

  let cancelled = false;
  let idleHandle: number | null = null;
  let timerHandle: number | null = null;

  const warmWhenIdle = () => {
    if (cancelled) return;
    const requestIdle = window.requestIdleCallback;
    if (requestIdle) {
      idleHandle = requestIdle.call(window, prefetch, { timeout: 1_200 });
    } else {
      timerHandle = window.setTimeout(prefetch, 300);
    }
  };

  if (document.readyState === "complete") warmWhenIdle();
  else window.addEventListener("load", warmWhenIdle, { once: true });

  return () => {
    cancelled = true;
    window.removeEventListener("load", warmWhenIdle);
    if (idleHandle !== null) window.cancelIdleCallback?.(idleHandle);
    if (timerHandle !== null) window.clearTimeout(timerHandle);
  };
}
