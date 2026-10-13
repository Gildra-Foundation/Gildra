import { routeLoadingCopy } from "./routeLoadingCopy";
/**
 * Route skeleton while a page streams in (talent calculator only). It stays
 * visually empty: the shared transition shows a thin progress line over the top
 * bar and fades the page in when this marker disappears (RouteTransitionRuntime
 * watches `data-book-route-loading`). The status text is for screen readers only.
 *
 * There is deliberately no root loading.tsx: a Suspense boundary around every
 * page made React reveal the streamed top bar through a View Transition on the
 * first load, which froze painting until images loaded (LCP −55 %, TBT −28 %
 * on phones without it, 2026-10-13). Static pages render whole; in-site
 * navigation keeps the old page under the progress fuse until the next is ready.
 */
export function RouteLoading({ lang = "en", talent = false }: { lang?: "en" | "ru"; talent?: boolean }) {
  const label = routeLoadingCopy[lang].loadingPage;
  return (
    <main data-book-route-loading data-talent-route={talent ? "" : undefined} role="status" aria-live="polite" style={{ minHeight: "55svh" }}>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>{label}…</span>
    </main>
  );
}
