'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { exclusionScript, isTrackedPage, PREVIEW_EXCLUSIONS } from '@/lib/cms/tracking';

export function PlausibleScript({ src, domain, api }: { src: string; domain: string; api?: string }) {
  const pathname = usePathname();
  const [hostname, setHostname] = useState('');
  useEffect(() => { setHostname(window.location.hostname); }, []);
  if (!isTrackedPage(hostname, domain, pathname)) return null;
  return <Script id="plausible" strategy="afterInteractive" defer data-domain={domain} data-api={api}
    data-exclude={PREVIEW_EXCLUSIONS} src={exclusionScript(src)} />;
}
