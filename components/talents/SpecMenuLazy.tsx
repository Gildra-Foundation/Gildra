"use client";

import { useCallback, useRef, useState, type ComponentType, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import styles from "./SpecMenu.module.css";

type CatalogProps = {
  current: TalentSpecTheme;
  localePrefix: string;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

type CatalogComponent = ComponentType<CatalogProps>;

export function SpecMenu({ current, localePrefix }: { current: TalentSpecTheme; localePrefix: string }) {
  const [open, setOpen] = useState(false);
  const [Catalog, setCatalog] = useState<CatalogComponent | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const loadRef = useRef<Promise<CatalogComponent> | null>(null);

  const preloadCatalog = useCallback(() => {
    if (Catalog || loadRef.current) return;
    const loading = import("./SpecMenuCatalog").then((module) => {
      const component = module.SpecMenuCatalog as CatalogComponent;
      setCatalog(() => component);
      return component;
    });
    loadRef.current = loading;
    void loading.catch(() => {
      loadRef.current = null;
    });
  }, [Catalog]);

  const close = useCallback(() => setOpen(false), []);
  const toggle = () => {
    if (!open) preloadCatalog();
    setOpen((value) => !value);
  };

  return (
    <div className={styles.root} ref={rootRef} onPointerEnter={preloadCatalog} onFocus={preloadCatalog}>
      <button
        className={styles.trigger}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-controls="tc-spec-menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={styles.triggerIcon} aria-hidden="true"><img src={current.iconUrl} alt="" width={30} height={30} /></span>
        <span className={styles.triggerCopy}><small>Специализация</small><b>{current.specNameRu}</b></span>
        <ChevronDown className={open ? styles.chevronOpen : undefined} aria-hidden="true" />
      </button>
      {open && !Catalog ? <span className={styles.menuLoading} role="status">Загружаю специализации…</span> : null}
      {open && Catalog ? <Catalog current={current} localePrefix={localePrefix} rootRef={rootRef} triggerRef={triggerRef} onClose={close} /> : null}
    </div>
  );
}
