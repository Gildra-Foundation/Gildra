"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Payload Live Preview for a server-rendered page: inside the admin's frame the
 * page announces itself and re-fetches the draft after every (auto)save, without
 * a reload and without losing the scroll position. Messages are accepted only
 * from the CMS origin; outside a frame this renders nothing and does nothing.
 */
export function LivePreviewRefresh({ cmsOrigin }: { cmsOrigin: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== cmsOrigin) return;
      const data = event.data as { type?: unknown } | null;
      if (data && typeof data === "object" && data.type === "payload-document-event") router.refresh();
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "payload-live-preview", ready: true }, cmsOrigin);
    return () => window.removeEventListener("message", onMessage);
  }, [cmsOrigin, router]);
  return null;
}
