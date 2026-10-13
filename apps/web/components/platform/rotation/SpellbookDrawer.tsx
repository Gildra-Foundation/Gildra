"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import type { RotationAbility } from "@/lib/platform/rotation/types";
import { AbilityIcon } from "./AbilityIcon";
import styles from "./rotationLab.module.css";
import folio from "./rotationManuscript.module.css";
import motion from "./rotationMotion.module.css";
import { spellbookDrawerCopy } from "./spellbookDrawerCopy";

type SpellbookCategory = "all" | NonNullable<RotationAbility["category"]>;

const categories: SpellbookCategory[] = ["all", "core", "class", "spec", "hero", "pvp"];
const SPELLS_PER_PAGE = 8;

function categoryLabel(category: SpellbookCategory, ru: boolean) {
  const labels = ru
    ? { all: "Все", core: "Основные", class: "Класс", spec: "Специализация", hero: "Герой", pvp: "PvP" }
    : { all: "All", core: "Core", class: "Class", spec: "Specialization", hero: "Hero", pvp: "PvP" };
  return labels[category];
}

export function SpellbookDrawer({ abilities, assignedIds, lang, onClose, onAdd, presentation = "book" }: {
  abilities: RotationAbility[];
  assignedIds: Set<string>;
  lang: Lang;
  onClose: () => void;
  onAdd: (abilityId: string) => void;
  presentation?: "book" | "catalog";
}) {
  const ru = lang === "ru";
  const catalog = presentation === "catalog";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SpellbookCategory>("all");
  const [page, setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Mobile uses a native-size book inside a sideways viewport. Autofocus
    // would scroll that viewport into the middle of the first page.
    if (window.matchMedia("(min-width: 721px)").matches) searchRef.current?.focus({ preventScroll: true });
  }, []);
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(spellbookDrawerCopy[lang].numberLocale);
    return abilities.filter((ability) => {
      const matchesCategory = category === "all" || (ability.category ?? "core") === category;
      const matchesQuery = !needle || (ability.name + " " + ability.hint).toLocaleLowerCase(spellbookDrawerCopy[lang].numberLocale).includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [abilities, category, lang, query]);
  const availableCategories = categories.filter((item) => item === "all" || abilities.some((ability) => (ability.category ?? "core") === item));
  const pageCount = Math.max(1, Math.ceil(visible.length / SPELLS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageAbilities = visible.slice(currentPage * SPELLS_PER_PAGE, (currentPage + 1) * SPELLS_PER_PAGE);
  const previewAbility = pageAbilities.find((ability) => ability.id === previewId) ?? pageAbilities[0] ?? null;

  const startDrag = (event: DragEvent<HTMLButtonElement>, abilityId: string) => {
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("application/x-gildra-ability", abilityId);
    event.dataTransfer.setData("text/plain", abilityId);
  };

  return (
    <aside className={`${styles.spellbookDrawer} ${folio.catalog}`} data-layout="wide" data-dense={availableCategories.length > 4 || undefined} aria-labelledby="spellbook-title" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
      <div className={`${styles.spellbookPage} ${styles.spellbookLeftPage} ${folio.indexPage}`}>
        <div className={`${styles.spellbookIndex} ${folio.index}`}>
          <header className={`${styles.spellbookLeftHeader} ${folio.catalogHeader}`}>
            <span><small>{catalog ? spellbookDrawerCopy[lang].currentBuildActiveAbilities : spellbookDrawerCopy[lang].abilityFolioCurrentBuild}</small><strong id="spellbook-title">{catalog ? spellbookDrawerCopy[lang].abilityCatalogue : spellbookDrawerCopy[lang].spellbook}</strong></span>
            <button type="button" onClick={onClose} aria-label={catalog ? spellbookDrawerCopy[lang].closeAbilityCatalogue : spellbookDrawerCopy[lang].closeSpellbook}><X /></button>
          </header>
          <label className={`${styles.spellbookSearch} ${folio.search}`}><Search aria-hidden="true" /><input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={spellbookDrawerCopy[lang].findAnAbility} aria-label={spellbookDrawerCopy[lang].searchAbilities} /></label>
          <nav className={`${styles.spellbookTabs} ${folio.categories} ${catalog ? motion.categories : ""}`} aria-label={catalog ? spellbookDrawerCopy[lang].abilityCategories : spellbookDrawerCopy[lang].spellbookSections}>
            {availableCategories.map((item) => <button key={item} type="button" title={categoryLabel(item, ru)} aria-pressed={category === item} onClick={() => { setCategory(item); setPage(0); }}><span>{categoryLabel(item, ru)}</span><small>{item === "all" ? abilities.length : abilities.filter((ability) => (ability.category ?? "core") === item).length}</small></button>)}
          </nav>
          <div className={`${styles.spellbookPreview} ${folio.preview}`}>
            <small>{catalog ? spellbookDrawerCopy[lang].abilityNotes : spellbookDrawerCopy[lang].abilityPage}</small>
            {previewAbility ? <><div><AbilityIcon ability={previewAbility} size="lg" /><strong>{previewAbility.name}</strong></div><p key={previewAbility.id} className={catalog ? motion.noteReveal : undefined}>{previewAbility.hint || spellbookDrawerCopy[lang].selectOrDragThis}</p></> : <p>{spellbookDrawerCopy[lang].thereAreNoAbilities}</p>}
          </div>
          <p className={`${styles.spellbookIndexHint} ${folio.catalogHint}`}>{catalog ? spellbookDrawerCopy[lang].chooseBesideAnAbility : spellbookDrawerCopy[lang].chooseAChapterThen}</p>
        </div>
      </div>
      <div className={`${styles.spellbookPage} ${styles.spellbookRightPage} ${folio.abilitiesPage}`}>
        <div className={`${styles.spellbookPages} ${folio.abilities}`}>
          <div className={`${styles.spellbookRightHeading} ${folio.listHeading}`}><span><small>{spellbookDrawerCopy[lang].activeAbilities}</small><strong>{categoryLabel(category, ru)}</strong></span>{!catalog && <button type="button" className={styles.spellbookMobileClose} onClick={onClose} aria-label={spellbookDrawerCopy[lang].closeSpellbook}><X /></button>}<span>{visible.length}</span></div>
          <div key={`${category}:${currentPage}`} className={`${styles.spellbookList} ${folio.spells} ${catalog ? motion.pageReveal : ""}`}>
          {pageAbilities.map((ability) => {
            const assigned = assignedIds.has(ability.id);
            return (
              <button
                key={ability.id}
                type="button"
                className={`${styles.spellbookAbility} ${folio.spell} ${catalog ? motion.catalogAbility : ""}`}
                data-assigned={assigned || undefined}
                data-preview={catalog && previewAbility?.id === ability.id || undefined}
                draggable={!assigned}
                onDragStart={(event) => startDrag(event, ability.id)}
                onMouseEnter={() => setPreviewId(ability.id)}
                onFocus={() => setPreviewId(ability.id)}
                onClick={() => { setPreviewId(ability.id); if (!assigned) onAdd(ability.id); }}
                aria-disabled={assigned}
                title={ability.hint}
              >
                <AbilityIcon ability={ability} size="lg" />
                <span><strong>{ability.name}</strong></span>
                <i>{assigned ? <><Check /> {spellbookDrawerCopy[lang].onBar}</> : <><Plus /> {spellbookDrawerCopy[lang].add}</>}</i>
              </button>
            );
          })}
          {!visible.length && <div className={styles.spellbookEmpty}><BookOpen /><strong>{spellbookDrawerCopy[lang].nothingFound}</strong><small>{spellbookDrawerCopy[lang].clearTheSearchOr}</small></div>}
          </div>
          <footer className={`${styles.spellbookPagination} ${folio.pagination}`}>
            <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label={spellbookDrawerCopy[lang].previousPage}><ChevronLeft /></button>
            <span>{spellbookDrawerCopy[lang].page} {currentPage + 1} / {pageCount}</span>
            <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label={spellbookDrawerCopy[lang].nextPage}><ChevronRight /></button>
          </footer>
        </div>
      </div>
    </aside>
  );
}
