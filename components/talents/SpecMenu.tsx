"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Shield, Swords, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { TalentSpecClass, TalentSpecTheme } from "@/lib/talentSpecThemes";
import { navigateTalentPage } from "@/lib/client/viewTransitionNavigation";
import styles from "./SpecMenu.module.css";

let talentSpecClassesPromise: Promise<TalentSpecClass[]> | null = null;

function loadTalentSpecClasses() {
  talentSpecClassesPromise ??= import("@/lib/talentSpecThemes").then((module) => module.talentSpecClasses);
  return talentSpecClassesPromise;
}

const roleIcon = {
  tank: Shield,
  healer: WandSparkles,
  melee: Swords,
  ranged: WandSparkles,
  support: WandSparkles,
} satisfies Record<TalentSpecTheme["role"], typeof Shield>;

export function SpecMenu({ current, localePrefix }: { current: TalentSpecTheme; localePrefix: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeClass, setActiveClass] = useState(current.classKey);
  const [specClasses, setSpecClasses] = useState<TalentSpecClass[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const currentClass = useMemo(
    () => specClasses?.find((group) => group.classKey === activeClass) ?? null,
    [activeClass, specClasses],
  );

  const preloadSpecClasses = () => {
    if (specClasses) return;
    void loadTalentSpecClasses().then(setSpecClasses);
  };

  useEffect(() => setActiveClass(current.classKey), [current.classKey]);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const compact = window.matchMedia("(max-width: 900px)").matches;
      setAnchor({
        left: compact ? 5 : Math.max(8, Math.min(rect.left, window.innerWidth - 608)),
        top: compact ? 58 : rect.bottom + 8,
      });
    };
    positionMenu();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", positionMenu);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", positionMenu);
    };
  }, [open]);

  const toggle = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const compact = window.matchMedia("(max-width: 900px)").matches;
      setAnchor({ left: compact ? 5 : Math.max(8, Math.min(rect.left, window.innerWidth - 608)), top: compact ? 58 : rect.bottom + 8 });
    }
    setActiveClass(current.classKey);
    preloadSpecClasses();
    setOpen((value) => !value);
  };

  const menuStyle = {
    left: anchor.left,
    top: anchor.top,
    "--tc-accent": current.accent,
    "--tc-hot": current.hot,
    "--tc-deep": current.deep,
    "--tc-accent-rgb": current.accentRgb,
    "--tc-hot-rgb": current.hotRgb,
    "--tc-ambient-rgb": current.ambientRgb,
  } as CSSProperties;

  return (
    <div className={styles.root} ref={rootRef} onPointerEnter={preloadSpecClasses} onFocus={preloadSpecClasses}>
      <button
        className={styles.trigger}
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-controls="tc-spec-menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={styles.triggerIcon} aria-hidden="true"><Image src={current.iconUrl} alt="" width={30} height={30} /></span>
        <span className={styles.triggerCopy}><small>Специализация</small><b>{current.specNameRu}</b></span>
        <ChevronDown className={open ? styles.chevronOpen : undefined} aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <section ref={menuRef} className={styles.menu} id="tc-spec-menu" role="menu" aria-label="Выбор специализации World of Warcraft" style={menuStyle}>
          <header className={styles.menuHeader}>
            <span className={styles.currentSigil} aria-hidden="true"><Image src={current.iconUrl} alt="" width={44} height={44} /></span>
            <span><small>World of Warcraft · Midnight</small><strong>Сменить специализацию</strong><p>Сначала класс, затем нужный стиль боя.</p></span>
            <button type="button" aria-label="Закрыть меню специализаций" onClick={() => setOpen(false)}><X /></button>
          </header>

          <div className={styles.classGrid} role="group" aria-label="Классы">
            {specClasses?.map((group) => {
              const active = group.classKey === activeClass;
              const seed = group.specs[0];
              return (
                <button
                  className={active ? styles.classActive : undefined}
                  key={group.classKey}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => setActiveClass(group.classKey)}
                  style={{ "--menu-class-accent": seed.accent, "--menu-class-rgb": seed.accentRgb } as CSSProperties}
                >
                  <Image src={seed.classIconUrl} alt="" width={26} height={26} />
                  <span>{group.classNameRu}</span>
                  <small>{group.specs.length}</small>
                </button>
              );
            }) ?? <span role="status">Загружаю классы…</span>}
          </div>

          <div className={styles.specSection}>
            <div className={styles.specHeading}>
              <span><small>Специализации класса</small><h2>{currentClass?.classNameRu ?? current.classNameRu}</h2></span>
              <span>{currentClass?.specs.length ?? 0} варианта</span>
            </div>
            <div className={styles.specList}>
              {currentClass?.specs.map((spec) => {
                const selected = spec.slug === current.slug;
                const RoleIcon = roleIcon[spec.role];
                const href = `${localePrefix}/talents/${spec.slug}`;
                return (
                  <Link
                    className={selected ? styles.specSelected : undefined}
                    key={spec.slug}
                    href={href}
                    prefetch
                    role="menuitem"
                    aria-current={selected ? "page" : undefined}
                    onClick={(event) => {
                      setOpen(false);
                      navigateTalentPage(event, href, () => router.push(href, { scroll: false }));
                    }}
                    style={{ "--menu-spec-accent": spec.accent, "--menu-spec-hot": spec.hot, "--menu-spec-rgb": spec.accentRgb } as CSSProperties}
                  >
                    <span className={styles.specIcon}><Image src={spec.iconUrl} alt="" width={44} height={44} /></span>
                    <span className={styles.specCopy}><b>{spec.specNameRu}</b><small><RoleIcon />{spec.roleRu}</small><em>{spec.fantasy}</em></span>
                    <span className={styles.specState}>{selected ? <><Check /><small>Выбрано</small></> : <><i /><small>Открыть</small></>}</span>
                  </Link>
                );
              }) ?? <span role="status">Загружаю специализации…</span>}
            </div>
          </div>

          <footer className={styles.menuFooter}>
            <span><i aria-hidden="true" />Фон, палитра и эффекты меняются вместе со специализацией</span>
            <kbd>Esc</kbd>
          </footer>
        </section>, document.body,
      ) : null}
    </div>
  );
}
