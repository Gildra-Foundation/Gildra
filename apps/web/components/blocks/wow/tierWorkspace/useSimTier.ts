"use client";
/** Data of the sim source tab (mythistone.com's simulated damage by target count and gear set). */
import { useEffect, useState } from "react";
import type { SimTierResponse } from "./simTierRows";

const ENDPOINT = "/v1/meta/wow/tier-list/sim";
let request: Promise<SimTierResponse> | null = null;

/** One request per page view, shared by every mount of the tab; a failure is retried on the next mount. */
function loadSimTier() {
  request ??= fetch(ENDPOINT).then(async (response) => {
    if (!response.ok) throw new Error(`sim tier list failed (${response.status})`);
    return await response.json() as SimTierResponse;
  }).catch((error: unknown) => {
    request = null;
    throw error;
  });
  return request;
}

export function useSimTier(enabled: boolean) {
  const [state, setState] = useState<{ data?: SimTierResponse; error?: boolean }>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadSimTier().then((data) => { if (live) setState({ data }); }).catch(() => { if (live) setState({ error: true }); });
    return () => { live = false; };
  }, [enabled]);
  return { data: state.data, error: Boolean(state.error), loading: enabled && !state.data && !state.error };
}
