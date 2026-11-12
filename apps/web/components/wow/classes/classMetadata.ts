import type { Metadata } from "next";
import { getMidnightClass, getMidnightClassSpec } from "@/lib/data/wow";
import { pageOpenGraph, pairedAlternates } from "@/lib/seo/metadata";
import type { Lang as Locale } from "@/lib/i18n-paths";

const words = {
  en: {
    classTitle: (name: string) => `${name} — WoW Midnight class — WowArcana`,
    classDescription: (name: string) => `${name} in Midnight: specializations, roles, Mythic+ tiers and hero talent trees.`,
    specTitle: (spec: string, cls: string) => `${spec} ${cls} — Midnight builds and tier — WowArcana`,
    specDescription: (spec: string, cls: string) => `${spec} ${cls}: tier in every list, top players' talent builds, hero trees, trinkets and weapons.`,
  },
  ru: {
    classTitle: (name: string) => `${name} — класс WoW Midnight — WowArcana`,
    classDescription: (name: string) => `${name} в Midnight: специализации, роли, тиры в Mythic+ и героические таланты.`,
    specTitle: (spec: string, cls: string) => `${spec} (${cls}) — билды и тир Midnight — WowArcana`,
    specDescription: (spec: string, cls: string) => `${spec} (${cls}): место в тир-листах, билды лучших игроков, героические таланты, аксессуары и оружие.`,
  },
} as const;

function metadata(locale: Locale, path: string, title: string, description: string): Metadata {
  const alternates = pairedAlternates(locale, path);
  return { title, description, alternates, openGraph: pageOpenGraph(locale, { title, description, path: String(alternates.canonical) }) };
}

export function classMetadata(locale: Locale, classSlug: string): Metadata {
  const entry = getMidnightClass(classSlug);
  if (!entry) return {};
  const name = locale === "ru" ? entry.nameRu : entry.nameEn;
  return metadata(locale, `/wow/classes/${entry.slug}`, words[locale].classTitle(name), words[locale].classDescription(name));
}

export function specMetadata(locale: Locale, classSlug: string, specSlug: string): Metadata {
  const spec = getMidnightClassSpec(classSlug, specSlug);
  if (!spec) return {};
  const name = locale === "ru" ? spec.specNameRu : spec.specName;
  const cls = locale === "ru" ? spec.classNameRu : spec.className;
  return metadata(locale, `/wow/classes/${spec.classSlug}/${spec.slug}`, words[locale].specTitle(name, cls), words[locale].specDescription(name, cls));
}
