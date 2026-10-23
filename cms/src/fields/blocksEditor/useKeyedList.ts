"use client";

import { useRef } from "react";

let counter = 0;
const nextKey = () => `k${++counter}`;

/**
 * Stable React/Sortable keys for a list whose items are replaced on every edit
 * (immutable updates): keys live beside the list and follow moves, inserts and
 * removals. A list replaced from outside (language switch, version restore)
 * with another length gets fresh keys.
 */
export function useKeyedList<T>(items: readonly T[]) {
  const keys = useRef<string[]>([]);
  if (keys.current.length !== items.length) keys.current = items.map(() => nextKey());
  const keyed = items.map((item, index) => ({ key: keys.current[index], item, index }));
  return {
    keyed,
    /** Apply a reorder given as the new key order. */
    reorder(order: string[]): T[] {
      const byKey = new Map(keyed.map((entry) => [entry.key, entry.item]));
      keys.current = order;
      return order.map((key) => byKey.get(key) as T);
    },
    insert(item: T, at = items.length): T[] {
      keys.current = [...keys.current.slice(0, at), nextKey(), ...keys.current.slice(at)];
      return [...items.slice(0, at), item, ...items.slice(at)];
    },
    remove(at: number): T[] {
      keys.current = keys.current.filter((_, index) => index !== at);
      return items.filter((_, index) => index !== at);
    },
    replace(at: number, item: T): T[] {
      return items.map((current, index) => (index === at ? item : current));
    },
  };
}
