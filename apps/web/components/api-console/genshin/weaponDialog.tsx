"use client";

import { useConsoleText } from "../consoleLocale";
import { ImageIcon, Maximize2 } from "lucide-react";
import type { Locale, Weapon, WeaponDetail, WeaponRefinement, ImagePreview } from "./types";
import {
  weaponLabel, formatStat, formatWeaponSpecialized, formatEffectDescription,
} from "./format";
import {
  StatTile, DialogHeader, LoadingDetail, DetailError, EmptyDetail, Stars, Fact,
} from "./primitives";
import { UpgradeCostList, LevelingCostTable } from "./costs";

export function WeaponDialog({ locale, weapon, detail, loading, error, onClose, onOpenImage }: {
  locale: Locale;
  weapon: Weapon | null; detail: WeaponDetail | null; loading: boolean; error: string;
  onClose: () => void; onOpenImage: (preview: ImagePreview) => void;
}) {
  const ct = useConsoleText();
  if (!weapon) return null;
  const en = locale === "en_US";
  const profile = detail ?? weapon;
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#05070b]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="genshin-weapon-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <DialogHeader eyebrow={en ? "Weapon profile" : ct("Профиль оружия")} title={profile.name} subtitle={ct(weaponLabel(profile.weaponType))} onClose={onClose} titleID="genshin-weapon-dialog-title" locale={locale} />
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="relative flex min-h-56 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)] sm:min-h-64">{profile.iconUrl ? <button type="button" className="relative h-full min-h-56 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: profile.iconUrl as string, label: profile.name })} aria-label={["", en ? "Open image" : "Открыть изображение", ": ", profile.name, ""].join("")}><img src={profile.iconUrl} alt={profile.name} className="h-full max-h-80 w-full object-contain p-6" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Stars count={profile.rarity} /><span className="border border-[#343c4b] px-2 py-1 text-[10px] text-[#aeb7c7]">{ct(weaponLabel(profile.weaponType))}</span></div><div className="mt-5 grid grid-cols-2 gap-px border border-[#2b3340] bg-[#2b3340] sm:grid-cols-4"><Fact label={en ? "Base attack" : ct("Базовая атака")} value={profile.baseAttack == null ? "—" : formatStat(profile.baseAttack)} /><Fact label={en ? "Secondary stat" : ct("Доп. стат")} value={profile.secondaryStat || "—"} /><Fact label={en ? "Value" : ct("Значение")} value={profile.secondaryStatValue == null ? "—" : formatStat(profile.secondaryStatValue)} /><Fact label="ID" value={String(profile.externalId)} mono /></div><p className="mt-5 whitespace-pre-line text-sm leading-6 text-[#b0bac9]">{detail?.description || (en ? "Weapon description is loaded with the profile." : ct("Описание оружия загружается вместе с профилем."))}</p></div>
        </div>
        {loading ? <LoadingDetail /> : error ? <DetailError text={error} /> : <div className="space-y-8 p-4 sm:p-6"><WeaponProgression locale={locale} detail={detail} /><WeaponEffect locale={locale} detail={detail} /><WeaponRefinementList locale={locale} refinements={detail?.refinements ?? []} /><UpgradeCostList title={en ? "Ascension materials" : ct("Ресурсы для возвышения")} stages={detail?.ascensionCosts ?? []} onOpenImage={onOpenImage} locale={locale} /><LevelingCostTable costs={detail?.levelingCosts ?? { levels: [], materials: [] }} locale={locale} onOpenImage={onOpenImage} /></div>}
      </div>
    </div>
  </div>;
}

function WeaponProgression({ locale, detail }: { locale: Locale; detail: WeaponDetail | null }) {
  const ct = useConsoleText();
  if (!detail) return null;
  const en = locale === "en_US";
  const stats = detail.stats;
  const maxLevel = stats?.promotion.at(-1)?.maxLevel ?? detail.ascensionCosts.at(-1)?.maxLevel;
  return <section className="space-y-6" aria-labelledby="genshin-weapon-progression-title">
    <div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Weapon progression" : ct("Развитие оружия")}</div><h3 id="genshin-weapon-progression-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Base stats and leveling" : ct("Базовые характеристики и прокачка")}</h3></div><span className="text-[10px] text-[#7d899b]">{maxLevel ? ["", maxLevel, " ", en ? "lvl." : "ур.", ""].join("") : "—"}</span></div>
    {stats ? <>
      <div className="grid gap-3 sm:grid-cols-2"><StatTile label={en ? "Base attack" : ct("Базовая атака")} value={formatStat(stats.base.attack)} /><StatTile label={detail.secondaryStat || (en ? "Secondary stat" : ct("Доп. характеристика"))} value={formatWeaponSpecialized(stats.base.specialized)} /></div>
      {stats.promotion.length ? <div className="overflow-x-auto border border-[#2b3340] bg-[#0c1017]"><table className="min-w-[420px] w-full text-left text-[10px]"><caption className="border-b border-[#2b3340] px-3 py-2 text-left text-[10px] uppercase tracking-[.12em] text-[#8e7540]">{en ? "Attack growth by ascension" : ct("Прирост атаки по возвышениям")}</caption><thead className="bg-[#111720] text-[#68758a]"><tr><th className="px-3 py-2 font-medium">{en ? "Max level" : ct("Макс. уровень")}</th><th className="px-3 py-2 font-medium">{en ? "Attack growth" : ct("Прирост атаки")}</th></tr></thead><tbody>{stats.promotion.map((row, index) => <tr key={`${row.maxLevel}-${index}`} className="border-t border-[#252d3a] text-[#aeb7c7]"><td className="px-3 py-2 font-semibold text-[#d5b35f]">{row.maxLevel}</td><td className="px-3 py-2">{row.attack ? formatStat(row.attack) : "—"}</td></tr>)}</tbody></table></div> : null}
    </> : <EmptyDetail text={en ? "Stats and ascension levels for this weapon are not present in the source." : ct("Характеристики и уровни возвышения для этого оружия пока не опубликованы в источнике.")} />}
  </section>;
}

function WeaponEffect({ locale, detail }: { locale: Locale; detail: WeaponDetail | null }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  if (!detail?.passiveName && !detail?.passiveDescription) return <EmptyDetail text={en ? "No passive effect is listed for this weapon." : ct("Пассивный эффект для этого оружия не указан.")} />;
  const description = formatEffectDescription(detail.passiveDescription, detail.refinements[0]?.values);
  return <section aria-labelledby="genshin-weapon-effect-title"><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Unique effect · R1" : ct("Уникальный эффект · R1")}</div><h3 id="genshin-weapon-effect-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{detail.passiveName || (en ? "Passive effect" : ct("Пассивный эффект"))}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{description || (en ? "Description unavailable." : ct("Описание отсутствует."))}</p></section>;
}

function WeaponRefinementList({ locale, refinements }: { locale: Locale; refinements: WeaponRefinement[] }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <section aria-labelledby="genshin-weapon-refinement-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Refinement levels" : ct("Уровни пробуждения")}</div><h3 id="genshin-weapon-refinement-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Effect by rank" : ct("Эффект по рангам")}</h3></div><span className="text-[10px] text-[#7d899b]">{refinements.length}/5</span></div>{refinements.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{refinements.map((refinement) => <div key={refinement.level} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex items-center justify-between"><span className="font-[family-name:var(--display)] text-base font-semibold text-[#d5b35f]">R{refinement.level}</span>{refinement.values.length ? <span className="text-[10px] text-[#778297]">{refinement.values.join(" · ")}</span> : null}</div><p className="mt-3 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{refinement.description || (en ? "Description unavailable." : ct("Описание отсутствует."))}</p></div>)}</div> : <div className="mt-4"><EmptyDetail text={en ? "Refinement levels are not listed." : ct("Данные об уровнях пробуждения не указаны.")} /></div>}</section>;
}
