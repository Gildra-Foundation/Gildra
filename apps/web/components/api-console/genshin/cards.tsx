"use client";

import { useConsoleText } from "../consoleLocale";
import { ChevronRight, ImageIcon, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Section, Character, Weapon, ArtifactSet, Talent, ImagePreview, Content, CatalogItem,
} from "./types";
import {
  elementColors, elementLabel, talentKindLabel, weaponLabel, contentCategoryLabel,
} from "./format";
import { Fact } from "./primitives";

export function CatalogCard({ section, item, onOpenCharacter, onOpenWeapon, onOpenArtifact, onOpenImage }: {
  section: Section;
  item: CatalogItem;
  onOpenCharacter: (character: Character) => void;
  onOpenWeapon: (weapon: Weapon) => void;
  onOpenArtifact: (artifact: ArtifactSet) => void;
  onOpenImage: (preview: ImagePreview) => void;
}) {
  const ct = useConsoleText();
  const imageURL = "portraitUrl" in item ? item.portraitUrl ?? item.iconUrl : item.iconUrl ?? ("media" in item ? item.media.find((media) => media.url)?.url ?? null : null);
  const rarityValue = "rarity" in item ? item.rarity : "maxRarity" in item ? item.maxRarity : 0;
  const interactive = section === "characters" || section === "weapons" || section === "artifact-sets";
  const character = section === "characters" ? item as Character : null;
  const weapon = section === "weapons" ? item as Weapon : null;
  const artifact = section === "artifact-sets" ? item as ArtifactSet : null;
  const activate = () => {
    if (character) onOpenCharacter(character);
    else if (weapon) onOpenWeapon(weapon);
    else if (artifact) onOpenArtifact(artifact);
  };
  return <article
    className={cn("group flex min-h-64 flex-col overflow-hidden border border-[#2b323f] bg-[#0d1118] transition-colors hover:border-[#6e603e]", interactive && "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d1aa53]")}
    onClick={interactive ? activate : undefined}
    onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } } : undefined}
    role={interactive ? "button" : undefined}
    tabIndex={interactive ? 0 : undefined}
    aria-label={interactive ? [ct("Открыть профиль: "), item.name, ""].join("") : undefined}
  >
    <div className="relative grid h-48 place-items-center overflow-hidden border-b border-[#28303d] bg-[radial-gradient(circle_at_50%_35%,rgba(201,162,79,.12),transparent_52%),linear-gradient(135deg,#111721,#090d13)] sm:h-52">
      {imageURL ? <button type="button" className="relative grid h-full w-full place-items-center cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={(event) => { event.stopPropagation(); onOpenImage({ url: imageURL, label: item.name }); }} aria-label={[ct("Открыть изображение: "), item.name, ""].join("")}>
        <img src={imageURL} alt="" className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" loading="lazy" />
        <span className="absolute bottom-2 right-2 grid size-7 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100" aria-hidden="true"><Maximize2 className="size-3.5" /></span>
      </button> : <ImageIcon className="size-8 text-[#3f4a5d]" strokeWidth={1.25} />}
      {rarityValue ? <div className="absolute left-3 top-3 flex gap-0.5 text-[#d9b65e]" aria-label={["", rarityValue, ct(" звёзд")].join("")}>{Array.from({ length: rarityValue }, (_, index) => <span key={index} className="text-[10px]">★</span>)}</div> : null}
      {"element" in item ? <span className={cn("absolute right-3 top-3 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.12em]", elementColors[item.element] ?? "border-[#394151] text-[#9ca6b8]")}>{ct(elementLabel(item.element))}</span> : null}
    </div>
    <div className="flex flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-[family-name:var(--display)] text-base font-semibold text-[#e2e6ed]">{item.name}</h3>{"title" in item && item.title ? <p className="mt-1 truncate text-[10px] text-[#7a8599]">{ct(item.title)}</p> : null}</div>{item.localeFallback ? <span className="shrink-0 border border-[#51452e] px-1.5 py-0.5 text-[10px] text-[#c3a258]">EN</span> : null}</div>
      <div className="mt-4 grid grid-cols-2 gap-px border border-[#262d39] bg-[#262d39] text-[10px]">
        {section === "characters" ? <CharacterFacts item={item as Character} /> : section === "talents" ? <TalentFacts item={item as Talent} /> : section === "weapons" ? <WeaponFacts item={item as Weapon} /> : section === "artifact-sets" ? <ArtifactFacts item={item as ArtifactSet} /> : <ContentFacts item={item as Content} />}
      </div>
      {section === "artifact-sets" ? <ArtifactEffectsPreview item={item as ArtifactSet} /> : null}
      {section === "weapons" ? <WeaponEffectPreview item={item as Weapon} /> : null}
      {section === "talents" ? <div className="mt-3 line-clamp-4 text-[10px] leading-4 text-[#7d899b]">{(item as Talent).description}</div> : null}
      {section === "content" ? <ContentDetails item={item as Content} /> : null}
      {interactive ? <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#262d39] pt-3 text-[10px] uppercase tracking-[.12em] text-[#8e7540]"><span>{ct("Открыть профиль")}</span><ChevronRight className="size-3.5" /></div> : null}
    </div>
  </article>;
}

function ArtifactEffectsPreview({ item }: { item: ArtifactSet }) {
  const ct = useConsoleText();
  return <div className="mt-3 space-y-2 text-[10px] leading-4 text-[#8995a8]">
    <div><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">{ct("2 предмета")}</span>{item.twoPieceBonus || ct("Бонус не указан.")}</div>
    <div><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">{ct("4 предмета")}</span>{item.fourPieceBonus || ct("Бонус не указан.")}</div>
  </div>;
}

function WeaponEffectPreview({ item }: { item: Weapon }) {
  const ct = useConsoleText();
  const description = item.passiveDescription?.replace(/\{\d+\}/g, "…") ?? "";
  return item.passiveName || description ? <div className="mt-3 line-clamp-4 text-[10px] leading-4 text-[#8995a8]"><span className="mr-1 uppercase tracking-[.08em] text-[#c9a24f]">{item.passiveName || ct("Пассивный эффект")}</span>{description || ct("Описание эффекта отсутствует.")}</div> : null;
}

function CharacterFacts({ item }: { item: Character }) {
  const ct = useConsoleText();
  return <><Fact label={ct("Оружие")} value={ct(weaponLabel(item.weaponType))} /><Fact label={ct("Таланты")} value={String(item.talentCount)} /><Fact label={ct("Регион")} value={item.region || "—"} /><Fact label="ID" value={String(item.externalId)} mono /></>;
}

function TalentFacts({ item }: { item: Talent }) {
  const ct = useConsoleText();
  return <><Fact label={ct("Персонаж")} value={item.characterName} /><Fact label={ct("Тип")} value={talentKindLabel(item.kind)} /><Fact label={ct("Ключ")} value={item.externalKey} mono /><Fact label="ID" value={String(item.id)} mono /></>;
}

function WeaponFacts({ item }: { item: Weapon }) {
  const ct = useConsoleText();
  return <><Fact label={ct("Тип")} value={ct(weaponLabel(item.weaponType))} /><Fact label={ct("Атака")} value={item.baseAttack == null ? "—" : String(item.baseAttack)} /><Fact label={ct("Доп. стат")} value={item.secondaryStat || "—"} /><Fact label="ID" value={String(item.externalId)} mono /></>;
}

function ArtifactFacts({ item }: { item: ArtifactSet }) {
  const ct = useConsoleText();
  return <><Fact label={ct("Предметов")} value={String(item.pieceCount)} /><Fact label={ct("Редкость")} value={`${item.minRarity}–${item.maxRarity}`} /></>;
}

function ContentFacts({ item }: { item: Content }) {
  const ct = useConsoleText();
  const media = item.media ?? [];
  return <><Fact label={ct("Раздел")} value={ct(contentCategoryLabel(item.category))} /><Fact label="ID" value={item.externalId == null ? "—" : String(item.externalId)} mono /><Fact label={ct("Медиа")} value={media.length ? String(media.length) : "—"} /><Fact label={ct("Ключ")} value={item.slug} mono /></>;
}

function ContentDetails({ item }: { item: Content }) {
  const ct = useConsoleText();
  const media = item.media ?? [];
  return <div className="mt-3">
    <div className="line-clamp-4 whitespace-pre-line text-[10px] leading-4 text-[#7d899b]">{item.description || ct("Полное содержимое доступно в исходном JSON ниже.")}</div>
    {media.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={ct("Изображения записи")}>{media.map((media) => media.url ? <img key={`${media.role}-${media.filename}`} src={media.url} alt={media.role} title={media.filename} className="size-12 shrink-0 rounded-sm border border-[#2b323f] bg-[#090d13] object-contain p-1" loading="lazy" /> : null)}</div> : null}
    <details className="mt-3 border border-[#2b323f] bg-[#0a0e14]">
      <summary className="cursor-pointer px-3 py-2 text-[10px] text-[#c9a24f]">{ct("Показать полный JSON")}</summary>
      <div className="border-t border-[#2b323f] p-3">
        <div className="mb-2 text-[10px] uppercase tracking-[.12em] text-[#68758a]">{ct("Локализованные данные")}</div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-[#aeb7c7]">{JSON.stringify(item.localizedPayload, null, 2)}</pre>
        <div className="mb-2 mt-4 text-[10px] uppercase tracking-[.12em] text-[#68758a]">{ct("Исходные данные")}</div>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-[#aeb7c7]">{JSON.stringify(item.sourcePayload, null, 2)}</pre>
      </div>
    </details>
  </div>;
}
