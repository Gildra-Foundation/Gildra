"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import { ResilientImage } from "@/components/media/ResilientImage";
import { CatalogGlyph } from "@/components/database/CatalogGlyph";
import { libraryCardCopy } from "@/components/library/libraryCardCopy";
import { matchLibraryDatasets, type LibraryRecordView } from "@/components/library/libraryRecordView";
import { itemQualityColors } from "@/lib/atlas/dataPalette";
import type { Lang } from "@/lib/i18n-paths";
import styles from "./librarySearchBox.module.css";

export type LibrarySearchSection = { slug: string; name: string; href: string; iconUrl?: string; iconSymbol?: string };

type Option = { kind: "section"; key: string; href: string; section: LibrarySearchSection }
  | { kind: "record"; key: string; href: string; record: LibraryRecordView }
  | { kind: "all"; key: string };

const DEBOUNCE = 140;

/**
 * The library search field with instant suggestions (WAI-ARIA combobox): after
 * two letters it lists matching sections (landing) and records — the whole
 * library, or one `dataset` — with their icons and quality colours. Arrows move,
 * Enter opens the highlighted entry or submits the surrounding GET form
 * (which still works without JavaScript), Escape closes.
 */
export function LibrarySearchBox({ lang, id, name = "q", defaultValue = "", placeholder, dataset, product = "wow", sections = [], required, className }: {
  lang: Lang; id: string; name?: string; defaultValue?: string; placeholder?: string;
  /** Suggest only records of this dataset. */
  dataset?: string;
  product?: string;
  /** Sections the landing suggests by name above the records. */
  sections?: LibrarySearchSection[];
  required?: boolean;
  className?: string;
}) {
  const copy = libraryCardCopy[lang];
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, LibraryRecordView[]>());
  const [query, setQuery] = useState(defaultValue);
  const [result, setResult] = useState<{ key: string; records: LibraryRecordView[] }>({ key: "", records: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const trimmed = query.trim();
  const key = `${dataset ?? ""}|${product}|${trimmed.toLocaleLowerCase()}`;
  // Records of an older query are not shown under a newer one; the field is busy until they arrive.
  const records = trimmed.length >= 2 && result.key === key ? result.records : [];
  const busy = trimmed.length >= 2 && result.key !== key;
  const matchedSections = matchLibraryDatasets(sections, trimmed);
  const options: Option[] = trimmed.length < 2 ? [] : [
    ...matchedSections.map((section): Option => ({ kind: "section", key: `s:${section.slug}`, href: section.href, section })),
    ...records.map((record): Option => ({ kind: "record", key: `r:${record.id}`, href: record.href, record })),
    { kind: "all", key: "all" },
  ];
  const shown = open && options.length > 0;

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const cached = cache.current.get(key);
    const timer = window.setTimeout(() => {
      if (cached) { setResult({ key, records: cached }); setActive(-1); return; }
      const params = new URLSearchParams({ q: trimmed, lang, product });
      if (dataset) params.set("dataset", dataset);
      fetch(`/api/platform/library/suggest?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() as Promise<{ records: LibraryRecordView[] }> : { records: [] }))
        .then(({ records: found }) => { cache.current.set(key, found); setResult({ key, records: found }); setActive(-1); })
        .catch((error: unknown) => { if ((error as Error).name !== "AbortError") setResult({ key, records: [] }); });
    }, cached ? 0 : DEBOUNCE);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [dataset, key, lang, product, trimmed]);

  // Letters typed before the page became interactive stay in the field.
  useEffect(() => {
    const typed = input.current?.value ?? "";
    if (typed && typed !== defaultValue) { setQuery(typed); setOpen(document.activeElement === input.current); }
  }, [defaultValue]);

  // Prefetch the highlighted record so Enter opens it at once.
  const activeOption = shown && active >= 0 ? options[active] : undefined;
  useEffect(() => {
    if (activeOption && activeOption.kind !== "all") router.prefetch(activeOption.href);
  }, [activeOption, router]);

  const submit = () => {
    setOpen(false);
    const form = input.current?.form;
    if (form) form.requestSubmit();
  };

  const choose = (option: Option) => {
    if (option.kind === "all") { submit(); return; }
    setOpen(false);
    router.push(option.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        const next = current + step;
        return next >= options.length ? -1 : next < -1 ? options.length - 1 : next;
      });
    } else if (event.key === "Enter" && activeOption) {
      event.preventDefault();
      choose(activeOption);
    } else if (event.key === "Escape") {
      if (shown) { event.preventDefault(); setOpen(false); }
    }
  };

  return (
    <div className={`${styles.box} ${className ?? ""}`} data-open={shown || undefined}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <AtlasInput ref={input} id={id} name={name} type="search" icon={<Search />} value={query} placeholder={placeholder} autoComplete="off" maxLength={200} required={required}
        role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={listId} aria-busy={busy || undefined}
        aria-activedescendant={activeOption ? `${listId}-${activeOption.key}` : undefined}
        onChange={(event) => { setQuery(event.target.value); setActive(-1); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown} />
      <ul id={listId} role="listbox" aria-label={copy.suggestionsLabel} className={styles.list} hidden={!shown}>
        {options.map((option, index) => {
          const selected = index === active;
          const common = { id: `${listId}-${option.key}`, role: "option", "aria-selected": selected, className: styles.option, "data-kind": option.kind,
            onMouseEnter: () => setActive(index), onMouseDown: (event: MouseEvent) => event.preventDefault() } as const;
          if (option.kind === "all") {
            return (
              <li key={option.key} {...common} onClick={() => choose(option)}>
                <span className={styles.allIcon} aria-hidden="true"><Search /></span>
                <span className={styles.name}>{copy.allResults(trimmed)}</span>
                <ArrowRight className={styles.go} aria-hidden="true" />
              </li>
            );
          }
          const first = index === 0 || options[index - 1].kind !== option.kind;
          const group = first ? <span className={styles.group} aria-hidden="true">{option.kind === "section" ? copy.sections : copy.records}</span> : null;
          if (option.kind === "section") {
            return (
              <li key={option.key} {...common} data-first={first || undefined}>
                {group}
                <Link href={option.href} prefetch={false} tabIndex={-1} className={styles.link} onClick={() => setOpen(false)}>
                  <span className={styles.icon} aria-hidden="true">
                    <ResilientImage src={option.section.iconUrl} alt="" width={28} height={28} loading="lazy" fallback={<CatalogGlyph symbol={option.section.iconSymbol ?? "#ic-gem"} />} />
                  </span>
                  <span className={styles.name}>{option.section.name}</span>
                </Link>
              </li>
            );
          }
          const record = option.record;
          const colour = record.quality !== undefined ? itemQualityColors[record.quality as keyof typeof itemQualityColors] : undefined;
          const meta = [record.typeLabel, record.itemLevel ? copy.levelShort(record.itemLevel) : null, record.slot].filter(Boolean).join(" · ");
          return (
            <li key={option.key} {...common} data-first={first || undefined}
              style={colour ? { "--record-quality": colour.frame, "--record-quality-text": colour.text } as CSSProperties : undefined}>
              {group}
              <Link href={record.href} prefetch={false} tabIndex={-1} className={styles.link} onClick={() => setOpen(false)}>
                <span className={styles.icon} data-quality={colour ? record.quality : undefined} aria-hidden="true">
                  <ResilientImage src={record.iconUrl} alt="" width={28} height={28} loading="lazy" fallback={<CatalogGlyph symbol="#ic-gem" />} />
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{record.name}</span>
                  <span className={styles.meta}>{meta}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
