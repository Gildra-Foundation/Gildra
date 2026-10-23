"use client";

import { useConsoleText } from "../consoleLocale";
import { ImageIcon, Maximize2 } from "lucide-react";
import type {
  Locale, ArtifactSet, ArtifactPiece, ArtifactSource, ArtifactDetail, ImagePreview,
} from "./types";
import { artifactSlotLabel } from "./format";
import {
  DialogHeader, LoadingDetail, DetailError, SmallMediaButton, EmptyDetail,
} from "./primitives";

export function ArtifactDialog({ locale, artifact, detail, loading, error, onClose, onOpenImage }: {
  locale: Locale;
  artifact: ArtifactSet | null; detail: ArtifactDetail | null; loading: boolean; error: string;
  onClose: () => void; onOpenImage: (preview: ImagePreview) => void;
}) {
  const ct = useConsoleText();
  if (!artifact) return null;
  const en = locale === "en_US";
  const profile = detail ?? artifact;
  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#05070b]/85 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="genshin-artifact-dialog-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden border border-[#4b4029] bg-[#0d1118] shadow-[0_28px_90px_rgba(0,0,0,.65)] sm:max-h-[calc(100vh-3rem)]">
      <DialogHeader eyebrow={en ? "Artifact set profile" : ct("Профиль набора артефактов")} title={profile.name} subtitle={`${profile.minRarity}–${profile.maxRarity} ★`} onClose={onClose} titleID="genshin-artifact-dialog-title" locale={locale} />
      <div className="min-h-0 overflow-y-auto">
        <div className="grid gap-5 border-b border-[#2b313e] bg-[radial-gradient(circle_at_18%_18%,rgba(201,162,79,.1),transparent_35%),#0b0f16] p-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-6">
          <div className="relative flex min-h-44 items-center justify-center overflow-hidden border border-[#343c4b] bg-[linear-gradient(145deg,#161d29,#090d13)]">{profile.iconUrl ? <button type="button" className="relative h-full min-h-44 w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#e6c77a]" onClick={() => onOpenImage({ url: profile.iconUrl as string, label: profile.name })} aria-label={[ct("Открыть изображение: "), profile.name, ""].join("")}><img src={profile.iconUrl} alt={profile.name} className="h-full max-h-60 w-full object-contain p-5" /><span className="absolute bottom-3 right-3 grid size-8 place-items-center border border-[#5b4c2b] bg-[#0a0d13]/85 text-[#d9b65e]"><Maximize2 className="size-4" /></span></button> : <ImageIcon className="size-10 text-[#4c586b]" strokeWidth={1.2} />}</div>
          <ArtifactEffects locale={locale} item={profile} />
        </div>
        {loading ? <LoadingDetail /> : error ? <DetailError text={error} /> : <div className="space-y-8 p-4 sm:p-6"><ArtifactSources locale={locale} sources={detail?.sources ?? []} /><ArtifactPieces locale={locale} pieces={detail?.pieces ?? []} onOpenImage={onOpenImage} /></div>}
      </div>
    </div>
  </div>;
}

function ArtifactEffects({ locale, item }: { locale: Locale; item: ArtifactSet }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <div className="min-w-0"><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Set bonuses" : ct("Бонусы комплекта")}</div><div className="mt-4 space-y-4"><div><h3 className="text-sm font-semibold text-[#e3e7ee]">{en ? "2-piece" : ct("2 предмета")}</h3><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{item.twoPieceBonus || (en ? "Bonus not listed." : ct("Бонус не указан."))}</p></div><div><h3 className="text-sm font-semibold text-[#e3e7ee]">{en ? "4-piece" : ct("4 предмета")}</h3><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#aeb7c7]">{item.fourPieceBonus || (en ? "Bonus not listed." : ct("Бонус не указан."))}</p></div></div></div>;
}

function ArtifactSources({ locale, sources }: { locale: Locale; sources: ArtifactSource[] }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <section aria-labelledby="genshin-artifact-sources-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Acquisition" : ct("Получение")}</div><h3 id="genshin-artifact-sources-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Where to obtain" : ct("Где получить")}</h3></div><span className="text-[10px] text-[#7d899b]">{sources.length} {en ? "sources" : ct("источников")}</span></div>{sources.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{sources.map((source) => <div key={`${source.slug}-${source.unlockRank}`} className="border border-[#2b3340] bg-[#111720] p-3"><h4 className="text-sm font-medium text-[#dce2eb]">{source.name}</h4><p className="mt-1 text-[10px] text-[#8995a8]">{source.entranceName || source.region || (en ? "Dungeon" : ct("Подземелье"))}</p>{source.note ? <p className="mt-2 text-[10px] leading-4 text-[#8894a7]">{source.note}</p> : null}<div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#aeb7c7]">{source.region ? <span className="border border-[#343c4b] px-2 py-1">{source.region}</span> : null}{source.unlockRank ? <span className="border border-[#343c4b] px-2 py-1">{en ? "AR" : ct("Ранг")} {source.unlockRank}</span> : null}{source.recommendedLevel ? <span className="border border-[#343c4b] px-2 py-1">{en ? "Rec. level" : ct("Рек. уровень")} {source.recommendedLevel}</span> : null}</div></div>)}</div> : <div className="mt-4"><EmptyDetail text={en ? "Acquisition is not listed in the published source." : ct("Способ получения не указан в опубликованном источнике.")} /></div>}</section>;
}

function ArtifactPieces({ locale, pieces, onOpenImage }: { locale: Locale; pieces: ArtifactPiece[]; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  const en = locale === "en_US";
  return <section aria-labelledby="genshin-artifact-pieces-title"><div className="flex items-end justify-between gap-3 border-b border-[#3a3425] pb-3"><div><div className="text-[10px] uppercase tracking-[.16em] text-[#8e7540]">{en ? "Set pieces" : ct("Комплект")}</div><h3 id="genshin-artifact-pieces-title" className="mt-1 font-[family-name:var(--display)] text-lg font-semibold text-[#e3e7ee]">{en ? "Five pieces" : ct("Пять предметов")}</h3></div><span className="text-[10px] text-[#7d899b]">{pieces.length}/5</span></div>{pieces.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{pieces.map((piece) => <div key={piece.id} className="border border-[#2b3340] bg-[#111720] p-3"><div className="flex gap-3"><SmallMediaButton url={piece.iconUrl} label={piece.name} onOpenImage={onOpenImage} /><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.1em] text-[#8e7540]">{ct(artifactSlotLabel(piece.slot))}</div><h4 className="mt-1 text-sm font-medium text-[#dce2eb]">{piece.name}</h4><p className="mt-2 whitespace-pre-line text-[10px] leading-4 text-[#8894a7]">{piece.description || (en ? "Description unavailable." : ct("Описание отсутствует."))}</p></div></div></div>)}</div> : <div className="mt-4"><EmptyDetail text={en ? "Set pieces were not found." : ct("Предметы набора не найдены.")} /></div>}</section>;
}
