import "server-only";
import type { GearPlannerItemData } from "./gearPlannerPresentation";

const icons = new Map<string, { url: string; expiresAt: number }>();
const maximum = 512;

/** Item identity imagery is independent of the item's scaled combat properties. */
export async function addPlannerItemIcons(items: GearPlannerItemData[], region: string, token: string, signal: AbortSignal) {
  if (!["eu", "us", "kr", "tw"].includes(region)) return;
  const pending = new Map<number, GearPlannerItemData[]>();
  for (const item of items) {
    if (item.iconUrl || !Number.isSafeInteger(item.itemId) || item.itemId <= 0) continue;
    const entries = pending.get(item.itemId) ?? [];
    entries.push(item);
    pending.set(item.itemId, entries);
  }
  const ids = [...pending.keys()].slice(0, 256);
  const mediaSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, async () => {
    while (next < ids.length) {
      signal.throwIfAborted();
      if (mediaSignal.aborted) return;
      const id = ids[next++];
      const key = `${region}:${id}`;
      let icon = icons.get(key);
      if (!icon || icon.expiresAt <= Date.now()) {
        try {
          const response = await fetch(`https://${region}.api.blizzard.com/data/wow/media/item/${id}?namespace=static-${region}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
            signal: AbortSignal.any([mediaSignal, AbortSignal.timeout(8_000)]),
          });
          if (!response.ok) continue;
          const payload = await response.json() as { assets?: Array<{ key?: string; value?: string }> };
          const url = payload.assets?.find(asset => asset.key === "icon")?.value;
          if (!url || !url.startsWith("https://")) continue;
          icon = { url, expiresAt: Date.now() + 24 * 60 * 60_000 };
          icons.delete(key);
          icons.set(key, icon);
          while (icons.size > maximum) icons.delete(icons.keys().next().value!);
        } catch {
          signal.throwIfAborted();
          // A media outage must not turn verified gear calculations into a failure.
          continue;
        }
      }
      for (const item of pending.get(id) ?? []) item.iconUrl = icon.url;
    }
  }));
}
