'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { exclusionScript, isTrackedPage, PREVIEW_EXCLUSIONS } from '@/lib/analytics/tracking';

export function PlausibleScript({ src, domain, api }: { src: string; domain: string; api?: string }) {
  const pathname = usePathname();
  // LazyAnalytics mounts this component with ssr:false; the hostname is fixed for this document.
  const hostname = typeof window === 'undefined' ? '' : window.location.hostname;
  if (!isTrackedPage(hostname, pathname)) return null;
  return <Script id="plausible" strategy="afterInteractive" defer data-domain={domain} data-api={api}
    data-exclude={PREVIEW_EXCLUSIONS} src={exclusionScript(src)} />;
}
