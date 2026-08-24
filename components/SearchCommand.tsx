"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { specIcon, classIcon } from "@/lib/gameAssets";
import { specHref } from "@/lib/specs";
import { SPEC_ICONS } from "@/lib/gameAssets";
import { classChips, builds, guidesList, featuredGuide, raid } from "@/data/site";
import { langOf, p, t as tr } from "@/lib/i18n";

type Item = {
  group: string;
  label: string;
  href: string;
  img?: string | null;
  sprite?: string;
};

/** Локальный индекс только по реально существующим данным и destinations. */
const INDEX: Item[] = [
  { group: "Pages", label: "World of Warcraft Database", href: "/database", sprite: "#ic-database" },
  { group: "Pages", label: "Mythic+ Tier List", href: "/tier-lists", sprite: "#ic-sword" },
  { group: "Pages", label: "Meta overview", href: "/#meta", sprite: "#ic-sword" },
  { group: "Pages", label: "Latest Guides", href: "/#guides", sprite: "#ic-book" },
  { group: "Raid", label: `${raid.name} — Current Raid`, href: "/#raid", sprite: "#ic-shield" },
  ...Object.keys(SPEC_ICONS).map((name) => ({
    group: "Specs",
    label: name,
    href: specHref(name),
    img: specIcon(name),
  })),
  ...classChips
    .filter((c) => c.key !== "all")
    .map((c) => ({
      group: "Classes",
      label: c.label,
      href: "/tier-lists",
      img: classIcon(c.key),
    })),
  ...builds.map((b) => ({
    group: "Builds",
    label: b.title,
    href: "/tier-lists#builds",
    img: specIcon(b.spec.name),
  })),
  ...[featuredGuide, ...guidesList].map((g) => ({
    group: "Guides",
    label: g.title,
    href: "/#guides",
    sprite: "#ic-book",
  })),
];

const GROUP_ORDER = ["Specs", "Classes", "Builds", "Raid", "Guides", "Pages"];

export function SearchCommand({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const lang = langOf(usePathname());
  const tt = tr(lang);

  // Cmd+K / Ctrl+K — глобально
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) onClose();
        else onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpen, onClose]);

  // сброс и фокус при открытии + scroll-lock
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hits = query
      ? INDEX.filter((i) => i.label.toLowerCase().includes(query))
      : INDEX.filter((i) => i.group === "Pages" || i.group === "Raid");
    return GROUP_ORDER.flatMap((g) => hits.filter((h) => h.group === g)).slice(
      0,
      12,
    );
  }, [q]);

  useEffect(() => {
    setSel(0);
  }, [results.length, q]);

  if (!open) return null;

  const go = (item: Item) => {
    onClose();
    router.push(p(lang, item.href));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSel(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSel(results.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[sel]) go(results[sel]);
    } else if (e.key === "Tab") {
      // focus trap: единственный фокусируемый элемент — input
      e.preventDefault();
    }
  };

  let lastGroup = "";

  return (
    <div className="sc-overlay" onMouseDown={onClose}>
      <div
        className="sc"
        role="dialog"
        aria-modal="true"
        aria-label="Search Gildra"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="sc-input">
          <svg className="i" aria-hidden="true">
            <use href="#ic-search" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt("Search specs, builds, guides...")}
            aria-label="Search"
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="sc-results" ref={listRef} role="listbox" aria-label="Results">
          {results.length === 0 && (
            <div className="sc-empty">
              <Image
                src="/brand/helmet.png"
                alt=""
                width={44}
                height={44}
              />
              {tt("No results for")} “{q}”
            </div>
          )}
          {results.map((r, i) => {
            const header =
              r.group !== lastGroup ? (
                <div className="sc-group" key={`g-${r.group}`}>
                  {tt(r.group)}
                </div>
              ) : null;
            lastGroup = r.group;
            return (
              <div key={`${r.group}-${r.label}`}>
                {header}
                <div
                  role="option"
                  aria-selected={i === sel}
                  className={`sc-item${i === sel ? " on" : ""}`}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(r)}
                >
                  {r.img ? (
                    <span className="sc-ico">
                      <Image src={r.img} alt="" width={56} height={56} />
                    </span>
                  ) : (
                    <span className="sc-ico sc-ico-ui">
                      <svg className="i" aria-hidden="true">
                        <use href={r.sprite} />
                      </svg>
                    </span>
                  )}
                  <span className="sc-label">{tt(r.label)}</span>
                  <span className="sc-go">↵</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
