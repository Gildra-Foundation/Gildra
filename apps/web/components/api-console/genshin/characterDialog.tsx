"use client";

import { useConsoleText } from "../consoleLocale";
import { ModalLayer } from "@gildra/atlas-ui/valyroParts";
import { ImageIcon, Maximize2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Locale, Character, CharacterDetail, TalentLevelCost, Talent, Constellation, ImagePreview,
} from "./types";
import {
  elementColors, elementLabel, talentKindLabel, weaponLabel, formatStat, formatPercent,
} from "./format";
import { StatTile, SmallMediaButton, EmptyDetail, Stars, Fact } from "./primitives";
import { UpgradeCostList, LevelingCostTable } from "./costs";

export function CharacterDialog({ locale, character, detail, loading, error, onClose, onOpenImage }: {
  locale: Locale;
  character: Character | null;
  detail: CharacterDetail | null;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  const ct = useConsoleText();
  if (!character) return null;
  const en = locale === "en_US";
  const profile = detail ?? character;
  const imageURL = profile.portraitUrl ?? profile.iconUrl;
  return <ModalLayer open onClose={onClose} aria-labelledby="genshin-character-dialog-title" layerClassName="z-[60] p-3 sm:p-6" className="flex w-full justify-center bg-transparent outline-none">
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#2b313e] bg-[#11151d] px-4 py-4 sm:px-6">
        <div className="min-w-0"><div className="text-[10px] uppercase tracking-[.18em] text-[#c9a24f]">{en ? "Character profile" : ct("Профиль персонажа")}</div><h2 id="genshin-character-dialog-title" className="mt-1 truncate font-[family-name:var(--display)] text-xl font-semibold text-[#edf0f5] sm:text-2xl">{profile.name}</h2><p className="mt-1 text-xs text-[#8290a4]">{profile.title || profile.region || "Genshin Impact"}</p></div>
        <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center border border-[#343b4a] text-[#9da7b7] transition-colors hover:border-[#8e7540] hover:text-[#e6c778]" aria-label={en ? "Close profile" : ct("Закрыть профиль")}><X className="size-4" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="relative flex min-h-64 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)] sm:min-h-80">
            {imageURL ? <button type="button" className="relative h-full min-h-64 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: imageURL, label: profile.name })} aria-label={["", en ? "Open image" : "Открыть изображение", ": ", profile.name, ""].join("")}><img src={imageURL} alt={profile.name} className="h-full max-h-[28rem] w-full object-contain p-3" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}
          </div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Stars count={profile.rarity} /><span className={cn("border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.1em]", elementColors[profile.element] ?? "border-[#394151] text-[#9ca6b8]")}>{ct(elementLabel(profile.element))}</span><span className="border border-[#343c4b] px-2 py-1 text-[10px] text-[#aeb7c7]">{ct(weaponLabel(profile.weaponType))}</span></div><p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-6 text-[#b0bac9]">{detail?.description || (en ? "Character description is loaded with the profile." : ct("Описание персонажа загружается вместе с профилем."))}</p><div className="mt-6 grid grid-cols-2 gap-px border border-[#2b3340] bg-[#2b3340] sm:grid-cols-4"><Fact label={en ? "Region" : ct("Регион")} value={profile.region || "—"} /><Fact label={en ? "Talents" : ct("Таланты")} value={String(profile.talentCount)} /><Fact label="ID" value={String(profile.externalId)} mono /><Fact label={en ? "Language" : ct("Язык")} value={profile.locale === "ru_RU" ? ct("Русский") : "English"} /></div></div>
        </div>
        {loading ? <div className="grid min-h-56 place-items-center p-6"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /><span className="sr-only">{en ? "Loading profile" : ct("Загрузка профиля")}</span></div> : error ? <div className="m-4 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-6">{error}</div> : <div className="space-y-8 p-4 sm:p-6"><CharacterProgression locale={locale} detail={detail} onOpenImage={onOpenImage} /><div className="grid gap-8 lg:grid-cols-2 lg:gap-10"><CharacterTalentList locale={locale} talents={detail?.talents ?? []} onOpenImage={onOpenImage} /><CharacterConstellationList locale={locale} constellations={detail?.constellations ?? []} onOpenImage={onOpenImage} /></div></div>}
      </div>
    </div>
  </ModalLayer>;
}

function CharacterProgression({ locale, detail, onOpenImage }: { locale: Locale; detail: CharacterDetail | null; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  if (!detail) return null;
  const en = locale === "en_US";
  const stats = detail.stats;
  return <section className="space-y-6" aria-labelledby="genshin-character-progression-title">
    <div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Character progression" : ct("Развитие персонажа")}</div><h3 id="genshin-character-progression-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Base stats and ascension" : ct("Базовые характеристики и возвышение")}</h3></div><span className="text-[10px] text-[#7d899b]">{en ? "Level 90" : ct("90 ур.")}</span></div>
    {stats ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatTile label={en ? "HP at level 1" : ct("HP на 1 уровне")} value={formatStat(stats.base.hp)} />
      <StatTile label={en ? "Attack at level 1" : ct("Атака на 1 уровне")} value={formatStat(stats.base.attack)} />
      <StatTile label={en ? "Defense at level 1" : ct("Защита на 1 уровне")} value={formatStat(stats.base.defense)} />
      <StatTile label={en ? "CRIT Rate" : ct("Шанс крит. попадания")} value={formatPercent(stats.base.critRate)} />
      <StatTile label={en ? "CRIT DMG" : ct("Крит. урон")} value={formatPercent(stats.base.critDamage)} />
    </div> : <EmptyDetail text={en ? "Base stats for this character form are not present in the source." : ct("Базовые характеристики для этой формы персонажа пока не опубликованы в источнике.")} />}
    {stats?.promotion.length ? <div className="overflow-x-auto border border-[#2b3340] bg-[#0c1017]"><table className="min-w-[680px] w-full text-left text-[10px]"><caption className="border-b border-[#2b3340] px-3 py-2 text-left text-[10px] uppercase tracking-[.12em] text-[#8e7540]">{en ? "Ascension stat growth" : ct("Прирост по возвышениям")}</caption><thead className="bg-[#111720] text-[#68758a]"><tr><th className="px-3 py-2 font-medium">{en ? "Max level" : ct("Макс. уровень")}</th><th className="px-3 py-2 font-medium">HP</th><th className="px-3 py-2 font-medium">{en ? "Attack" : ct("Атака")}</th><th className="px-3 py-2 font-medium">{en ? "Defense" : ct("Защита")}</th><th className="px-3 py-2 font-medium">{en ? "Special stat" : ct("Спец. стат")}</th></tr></thead><tbody>{stats.promotion.map((row, index) => <tr key={`${row.maxLevel}-${index}`} className="border-t border-[#252d3a] text-[#aeb7c7]"><td className="px-3 py-2 font-semibold text-[#d5b35f]">{row.maxLevel}</td><td className="px-3 py-2">{formatStat(row.hp)}</td><td className="px-3 py-2">{formatStat(row.attack)}</td><td className="px-3 py-2">{formatStat(row.defense)}</td><td className="px-3 py-2">{row.specialized ? formatStat(row.specialized) : "—"}</td></tr>)}</tbody></table></div> : null}
    <UpgradeCostList title={en ? "Ascension materials" : ct("Ресурсы для возвышения")} stages={detail.ascensionCosts} onOpenImage={onOpenImage} locale={locale} />
    <LevelingCostTable costs={detail.levelingCosts} locale={locale} onOpenImage={onOpenImage} />
  </section>;
}

function CharacterTalentList({ locale, talents, onOpenImage }: { locale: Locale; talents: Talent[]; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <section aria-labelledby="genshin-character-talents-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Combat skills" : ct("Боевые навыки")}</div><h3 id="genshin-character-talents-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Talents" : ct("Таланты")}</h3></div><span className="text-[10px] tabular-nums text-[#7d899b]">{talents.length}</span></div><div className="mt-4 space-y-3">{talents.length ? talents.map((talent) => <div key={talent.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={talent.iconUrl} label={talent.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.1em] text-[#8e7540]">{talentKindLabel(talent.kind)}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{talent.name}</h4><p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{talent.description || (en ? "Description unavailable." : ct("Описание отсутствует."))}</p>{talent.upgradeCosts?.length ? <TalentCostList locale={locale} costs={talent.upgradeCosts} onOpenImage={onOpenImage} /> : null}</div></div></div>) : <EmptyDetail text={en ? "No talents were found for this character." : ct("Для этого персонажа таланты не найдены.")} />}</div></section>;
}

function TalentCostList({ locale, costs, onOpenImage }: { locale: Locale; costs: TalentLevelCost[]; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <details className="mt-3 border border-[#2b3340] bg-[#0c1017]"><summary className="cursor-pointer px-3 py-2 text-[10px] font-medium text-[#c9a24f]">{en ? "Talent level-up materials" : ct("Ресурсы талантов по уровням")}</summary><div className="space-y-2 border-t border-[#2b3340] p-3">{costs.map((cost) => <div key={cost.level} className="flex flex-wrap items-center gap-2 text-[10px]"><span className="w-10 font-semibold text-[#d5b35f]">{en ? "Lv." : ct("Ур.")}{cost.level}</span>{cost.items.map((item, index) => <span key={`${cost.level}-${item.id}-${index}`} className="inline-flex items-center gap-1 border border-[#303847] px-1.5 py-1 text-[#aeb7c7]"><SmallMediaButton url={item.iconUrl ?? null} label={item.name} onOpenImage={onOpenImage} /><span>{item.name}</span><b className="font-mono text-[#d5b35f]">×{item.count.toLocaleString(en ? "en-US" : "ru-RU")}</b></span>)}</div>)}</div></details>;
}

function CharacterConstellationList({ locale, constellations, onOpenImage }: { locale: Locale; constellations: Constellation[]; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <section aria-labelledby="genshin-character-constellations-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Constellation" : ct("Созвездие")}</div><h3 id="genshin-character-constellations-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Constellations" : ct("Созвездия")}</h3></div><span className="text-[10px] tabular-nums text-[#7d899b]">{constellations.length}/6</span></div><div className="mt-4 space-y-3">{constellations.length ? constellations.map((constellation) => <div key={constellation.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={constellation.iconUrl} label={constellation.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.1em] text-[#8e7540]">C{constellation.position}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{constellation.name}</h4><p className="mt-2 whitespace-pre-line text-[11px] leading-5 text-[#8894a7]">{constellation.description || (en ? "Description unavailable." : ct("Описание отсутствует."))}</p></div></div></div>) : <EmptyDetail text={en ? "No constellations were found for this character." : ct("Для этого персонажа созвездия не найдены.")} />}</div></section>;
}
