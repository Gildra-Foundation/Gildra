"use client";

import dynamic from "next/dynamic";

// Both render nothing on the server and only matter when Plausible is configured,
// so their code (next/script, web-vitals) loads as a separate chunk when mounted
// instead of riding along in the shared bundle of every page.
export const LazyPlausibleScript = dynamic(() => import("./PlausibleScript").then((module) => module.PlausibleScript), { ssr: false });
export const LazyWebVitals = dynamic(() => import("./WebVitals").then((module) => module.WebVitals), { ssr: false });
