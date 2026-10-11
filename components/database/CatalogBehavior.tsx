"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trackCatalogEvent } from "@/lib/catalogAnalytics";

type CatalogEvent = Parameters<typeof trackCatalogEvent>[0];

/**
 * The only always-loaded client code of the catalog workspace. The workspace
 * itself is server-rendered links and GET forms (it works without JS); this
 * island upgrades them in place through event delegation on `#rootId`:
 *  - `a[data-catalog-nav]` and `form[data-catalog-form]` navigate softly inside
 *    a transition, and the root gets `data-pending` while the next page loads;
 *  - GET forms drop empty fields, so URLs stay clean;
 *  - `select[data-autosubmit]` submits its form on change;
 *  - `[data-history-back]` goes back in history (its href is the fallback);
 *  - `[data-scroll-to]` links first bring that element into view (pagination);
 *  - `[data-track]` elements report catalog analytics (consent-gated).
 */
export function CatalogBehavior({ rootId, lang, zeroResults }: { rootId: string; lang: "en" | "ru"; zeroResults?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    document.getElementById(rootId)?.toggleAttribute("data-pending", pending);
  }, [pending, rootId]);

  useEffect(() => {
    if (!zeroResults) return;
    trackCatalogEvent("catalog_zero_results", lang, JSON.parse(zeroResults) as Record<string, string>);
  }, [lang, zeroResults]);

  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    const go = (href: string) => startTransition(() => router.push(href, { scroll: false }));
    const track = (element: Element | null, extra: Record<string, string> = {}) => {
      const name = element?.getAttribute("data-track");
      if (!name) return;
      let properties: Record<string, string> = {};
      try { properties = JSON.parse(element?.getAttribute("data-track-props") ?? "{}") as Record<string, string>; } catch { /* malformed props are dropped */ }
      trackCatalogEvent(name as CatalogEvent, lang, { ...properties, ...extra });
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      track(event.target.closest("[data-track]"));
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const back = event.target.closest<HTMLAnchorElement>("a[data-history-back]");
      if (back && window.history.length > 1) {
        event.preventDefault();
        router.back();
        return;
      }
      const link = event.target.closest<HTMLAnchorElement>("a[data-catalog-nav]");
      if (link && root.contains(link)) {
        event.preventDefault();
        const target = link.dataset.scrollTo ? document.getElementById(link.dataset.scrollTo) : null;
        if (target && target.getBoundingClientRect().top < 0) target.scrollIntoView({ block: "start" });
        go(`${link.pathname}${link.search}`);
      }
    };

    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-catalog-form")) return;
      event.preventDefault();
      const data = new FormData(form);
      const params = new URLSearchParams();
      data.forEach((value, key) => {
        if (typeof value === "string" && value.trim()) params.append(key, value.trim());
      });
      track(form, { query: String(data.get("q") ?? "").trim() });
      const action = new URL(form.action, window.location.href);
      go(params.size ? `${action.pathname}?${params}` : action.pathname);
    };

    const onChange = (event: Event) => {
      const select = event.target;
      if (select instanceof HTMLSelectElement && select.hasAttribute("data-autosubmit")) select.form?.requestSubmit();
    };

    root.addEventListener("click", onClick);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("change", onChange);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("submit", onSubmit);
      root.removeEventListener("change", onChange);
    };
  }, [lang, rootId, router]);

  return null;
}
