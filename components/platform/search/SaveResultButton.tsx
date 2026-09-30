"use client";

import { useEffect, useState } from "react";
import { Bookmark, Check } from "lucide-react";

const STORAGE_KEY = "gildra:saved-catalog-records";

export function SaveResultButton({ id, label, lang }: { id: string; label: string; lang: "en" | "ru" }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const records = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
      setSaved(records.includes(id));
    } catch {
      setSaved(false);
    }
  }, [id]);

  const toggle = () => {
    try {
      const records = new Set(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as string[]);
      if (records.has(id)) records.delete(id);
      else records.add(id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...records]));
      setSaved(records.has(id));
    } catch {
      setSaved((current) => !current);
    }
  };

  const action = saved
    ? (lang === "ru" ? "Убрать из сохранённых" : "Remove from saved")
    : (lang === "ru" ? "Сохранить" : "Save");

  return (
    <button type="button" data-saved={saved || undefined} aria-pressed={saved} aria-label={`${action}: ${label}`} title={action} onClick={toggle}>
      {saved ? <Check size={17} /> : <Bookmark size={17} />}
    </button>
  );
}
