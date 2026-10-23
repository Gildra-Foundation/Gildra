"use client";

import { useConsoleText } from "../consoleLocale";
import { Box, ImageIcon, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale, ImagePreview } from "./types";

export function ElementRail() {
  return <div className="grid h-1 grid-cols-7" aria-hidden="true"><span className="bg-[#62c6b4]" /><span className="bg-[#d0a743]" /><span className="bg-[#9874cf]" /><span className="bg-[#86a943]" /><span className="bg-[#5b94d1]" /><span className="bg-[#ca684c]" /><span className="bg-[#83bdc7]" /></div>;
}

export function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-[#0c1017] px-3 py-3"><div className="text-[10px] uppercase tracking-[.12em] text-[#667185]">{label}</div><div className="mt-1 font-[family-name:var(--display)] text-lg font-semibold tabular-nums text-[#dce1e9]">{value.toLocaleString("ru-RU")}</div></div>;
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full border border-[#303746] bg-[#090d13] px-3 text-xs text-[#abb4c3] outline-none focus:border-[#9b8148]">{options.map(([id, text]) => <option key={`${label}-${id}`} value={id}>{text}</option>)}</select></label>;
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return <div className="border border-[#2b3340] bg-[#111720] px-3 py-3"><div className="text-[10px] uppercase tracking-[.08em] text-[#68758a]">{label}</div><div className="mt-2 font-[family-name:var(--display)] text-lg font-semibold tabular-nums text-[#dce2eb]">{value}</div></div>;
}

export function DialogHeader({ eyebrow, title, subtitle, titleID, onClose, locale }: { eyebrow: string; title: string; subtitle: string; titleID: string; onClose: () => void; locale: Locale }) {
  const ct = useConsoleText();
  return <div className="flex items-start justify-between gap-4 border-b border-[#2b313e] bg-[#11151d] px-4 py-4 sm:px-6"><div className="min-w-0"><div className="text-[10px] uppercase tracking-[.18em] text-[#c9a24f]">{eyebrow}</div><h2 id={titleID} className="mt-1 truncate font-[family-name:var(--display)] text-xl font-semibold text-[#edf0f5] sm:text-2xl">{title}</h2><p className="mt-1 text-xs text-[#8290a4]">{subtitle}</p></div><button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center border border-[#343b4a] text-[#9da7b7] transition-colors hover:border-[#8e7540] hover:text-[#e6c778]" aria-label={locale === "en_US" ? "Close profile" : ct("Закрыть профиль")}><X className="size-4" /></button></div>;
}

export function LoadingDetail() {
  const ct = useConsoleText();
  return <div className="grid min-h-56 place-items-center p-6"><RefreshCw className="size-6 animate-spin text-[#c9a24f]" /><span className="sr-only">{ct("Загрузка профиля")}</span></div>;
}

export function DetailError({ text }: { text: string }) {
  return <div className="m-4 border border-[#693b3e] bg-[#211215] p-4 text-sm text-[#eba0a3] sm:m-6">{text}</div>;
}

export function SmallMediaButton({ url, label, onOpenImage }: { url: string | null; label: string; onOpenImage: (preview: ImagePreview) => void }) {
  const ct = useConsoleText();
  if (!url) return <div className="grid size-12 shrink-0 place-items-center border border-[#303847] bg-[#0a0e14]"><ImageIcon className="size-4 text-[#536075]" /></div>;
  return <button type="button" onClick={() => onOpenImage({ url, label })} className="relative size-12 shrink-0 cursor-zoom-in overflow-hidden border border-[#3b3d35] bg-[#0a0e14] p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e6c77a]" aria-label={[ct("Открыть изображение: "), label, ""].join("")}><img src={url} alt="" className="h-full w-full object-contain" /></button>;
}

export function EmptyDetail({ text }: { text: string }) {
  return <div className="border border-dashed border-[#303847] bg-[#0c1017] p-5 text-center text-xs text-[#738095]">{text}</div>;
}

export function ImageLightbox({ preview, onClose }: { preview: ImagePreview | null; onClose: () => void }) {
  const ct = useConsoleText();
  if (!preview) return null;
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030407]/95 p-3 backdrop-blur-md sm:p-8" role="dialog" aria-modal="true" aria-labelledby="genshin-image-preview-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="relative flex max-h-full max-w-6xl flex-col items-center gap-3"><button type="button" onClick={onClose} className="absolute -right-1 -top-1 z-10 grid size-9 place-items-center border border-[#51452e] bg-[#0b0e14]/95 text-[#e6c778] hover:bg-[#171a20]" aria-label={ct("Закрыть изображение")}><X className="size-4" /></button><img src={preview.url} alt={ct(preview.label)} className="max-h-[82vh] max-w-[94vw] object-contain sm:max-h-[86vh] sm:max-w-[88vw]" /><div id="genshin-image-preview-title" className="border border-[#343c4b] bg-[#0b0e14]/95 px-4 py-2 text-center text-xs text-[#cbd2de]">{ct(preview.label)}</div></div></div>;
}

export function Stars({ count }: { count: number }) {
  const ct = useConsoleText();
  return <span className="flex gap-0.5 text-[#d9b65e]" aria-label={["", count, ct(" звёзд")].join("")}>{Array.from({ length: count }, (_, index) => <span key={index} className="text-[10px]">★</span>)}</span>;
}

export function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 bg-[#10151d] px-2.5 py-2"><div className="uppercase tracking-[.1em] text-[#5f6a7d]">{label}</div><div className={cn("mt-1 truncate text-[10px] text-[#adb5c4]", mono && "font-mono")}>{value}</div></div>;
}

export function CatalogSkeleton() {
  const ct = useConsoleText();
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label={ct("Загрузка каталога")}>{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-72 animate-pulse border border-[#28303d] bg-[linear-gradient(110deg,#0d1118_25%,#151b25_42%,#0d1118_58%)] bg-[length:200%_100%] motion-reduce:animate-none" />)}</div>;
}

export function EmptyCatalog({ ready, query }: { ready: boolean; query: string }) {
  const ct = useConsoleText();
  return <div className="grid min-h-64 place-items-center border border-dashed border-[#303847] bg-[#0c1017] px-5 text-center"><div className="max-w-md"><Box className="mx-auto size-8 text-[#536075]" strokeWidth={1.3} /><h3 className="mt-4 font-[family-name:var(--display)] text-lg font-semibold text-[#cfd5df]">{query ? ct("Ничего не найдено") : ready ? ct("В этом разделе пока нет записей") : ct("База готова к первому импорту")}</h3><p className="mt-2 text-xs leading-5 text-[#738095]">{query ? ct("Измените запрос или сбросьте фильтры.") : ready ? ct("Опубликованный релиз не содержит выбранный тип данных.") : ct("Структура PostgreSQL и API уже подключены. Здесь появятся данные после загрузки первого проверенного релиза.")}</p></div></div>;
}
