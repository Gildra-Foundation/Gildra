"use client";

import { useEffect, useState } from "react";
import type { TalentChoice } from "@/lib/talentCalculatorData";

type DescribedTalent = Pick<TalentChoice, "description" | "name" | "spellId">;

const cache = new Map<string, string>();
const requests = new Map<string, Promise<string>>();
const placeholder = /^Описание загружается из игрового справочника/i;

/** Blizzard sometimes returns numeric tooltip substitutions instead of rendered text. */
export function formatTalentDescription(description: string, locale: "ru" | "en" = "ru") {
  const units: Record<string, { ru: string; en: string }> = {
    "attack power": { ru: "силы атаки", en: "of Attack Power" },
    "spell power": { ru: "силы заклинаний", en: "of Spell Power" },
    "weapon damage": { ru: "урона оружия", en: "of Weapon Damage" },
  };
  const replacePower = (_token: string, amount: string, unit: string) => `${amount}% ${units[unit.toLowerCase()][locale]}`;
  return description
    .replace(/\{\{\s*(\d+(?:[.,]\d+)?)\s*%\s+of\s+(Attack Power|Spell Power|Weapon Damage)\s*\}\}/gi, replacePower)
    .replace(/\[\s*(\d+(?:[.,]\d+)?)\s*%\s+of\s+(Attack Power|Spell Power|Weapon Damage)\s*\]/gi, replacePower)
    .replace(/\{\{\s*(\d+(?:[.,]\d+)?)\s*(%)?\s*\}\}/g, (_token, amount: string, percent?: string) => `${amount}${percent ?? ""}`);
}

function suppliedDescription(talent: DescribedTalent) {
  const description = talent.description.trim();
  return description && !placeholder.test(description) ? description : "";
}

function requestDescription(talent: DescribedTalent, locale: "ru" | "en") {
  const supplied = suppliedDescription(talent);
  if (supplied) return Promise.resolve(supplied);
  if (!talent.spellId) return Promise.resolve("");
  const key = `${locale}:${talent.spellId}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = requests.get(key);
  if (existing) return existing;
  const request = fetch(`/api/wow/talents/${talent.spellId}/description?locale=${locale}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  }).then(async (response) => {
    if (!response.ok) return "";
    const payload = await response.json() as { description?: unknown };
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    if (description) cache.set(key, description);
    return description;
  }).catch(() => "").finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

export function TalentDescription({ talent, locale = "ru" }: { talent: DescribedTalent; locale?: "ru" | "en" }) {
  const supplied = suppliedDescription(talent);
  const key = `${locale}:${talent.spellId}`;
  const [description, setDescription] = useState(() => supplied || (talent.spellId ? cache.get(key) ?? "" : ""));
  const [resolved, setResolved] = useState(Boolean(supplied || (talent.spellId && cache.has(key))));

  useEffect(() => {
    let active = true;
    const immediate = supplied || (talent.spellId ? cache.get(key) ?? "" : "");
    setDescription(immediate);
    setResolved(Boolean(immediate));
    if (immediate || !talent.spellId) return () => { active = false; };
    void requestDescription(talent, locale).then((value) => {
      if (!active) return;
      setDescription(value);
      setResolved(true);
    });
    return () => { active = false; };
  }, [key, locale, supplied, talent.name, talent.spellId]);

  const fallback = talent.spellId
    ? resolved ? locale === "ru" ? "Подробное описание пока не опубликовано игровым источником." : "The game source has not published a detailed description yet." : locale === "ru" ? "Загружаем описание способности…" : "Loading ability description…"
    : locale === "ru" ? "У этого узла нет отдельного заклинания с описанием." : "This node has no separate spell description.";
  return <p data-description-state={description ? "ready" : resolved ? "unavailable" : "loading"}>{formatTalentDescription(description || fallback, locale)}</p>;
}
