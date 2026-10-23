"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Shield, Swords, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { talentSpecClasses, type TalentSpecTheme } from "@/lib/talentSpecThemes";
import { navigateTalentPage } from "@/lib/client/viewTransitionNavigation";
import { talentCalculatorCopy, talentThemeNames, type TalentCopyLang } from "./talentCalculatorCopy";
import styles from "./SpecMenu.module.css";

const roleIcon = {
  tank: Shield,
  healer: WandSparkles,
  melee: Swords,
  ranged: WandSparkles,
  support: WandSparkles,
} satisfies Record<TalentSpecTheme["role"], typeof Shield>;

type SpecMenuCatalogProps = {
  current: TalentSpecTheme;
  localePrefix: string;
  lang: TalentCopyLang;
  rootRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
};

export function SpecMenuCatalog({ current, localePrefix, lang, rootRef, triggerRef, onClose }: SpecMenuCatalogProps) {
  const copy = talentCalculatorCopy[lang].specMenu;
  const router = useRouter();
  const [activeClass, setActiveClass] = useState(current.classKey);
  const menuRef = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState({ left: 0, top: 0, maxHeight: 640 });
  const currentClass = useMemo(
    () => talentSpecClasses.find((group) => group.classKey === activeClass) ?? talentSpecClasses[0],
    [activeClass],
  );

  useEffect(() => setActiveClass(current.classKey), [current.classKey]);

  useEffect(() => {
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const compact = window.matchMedia("(max-width: 900px)").matches;
      // Open right under the trigger, below the global sticky bar, and keep the
      // whole menu inside the viewport (it scrolls internally when short).
      const top = Math.max(rect.bottom + 8, 72);
      setAnchor({
        left: compact ? 8 : Math.max(8, Math.min(rect.left, window.innerWidth - 608)),
        top,
        maxHeight: Math.max(260, window.innerHeight - top - 12),
      });
    };
    positionMenu();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
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
  }, [onClose, rootRef, triggerRef]);

  // Positioned under the trigger; chrome colours come from the atlas tokens
  // (data-atlas-scope), class and spec colours stay on the entries they describe.
  const menuStyle = { left: anchor.left, top: anchor.top, maxHeight: anchor.maxHeight } as CSSProperties;
  const className = (group: (typeof talentSpecClasses)[number]) => lang === "ru" ? group.classNameRu : group.specs[0].className;

  return createPortal(
    <section ref={menuRef} className={styles.menu} id="tc-spec-menu" role="menu" aria-label={copy.menuLabel} style={menuStyle} data-atlas-scope="" lang={lang}>
      <header className={styles.menuHeader}>
        <span className={styles.currentSigil} aria-hidden="true"><Image src={current.iconUrl} alt="" width={44} height={44} /></span>
        <span><small>World of Warcraft · Midnight</small><strong>{copy.heading}</strong><p>{copy.hint}</p></span>
        <button type="button" aria-label={copy.closeMenu} onClick={onClose}><X /></button>
      </header>

      <div className={styles.classGrid} role="group" aria-label={copy.classes}>
        {talentSpecClasses.map((group) => {
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
              <span>{className(group)}</span>
              <small>{group.specs.length}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.specSection}>
        <div className={styles.specHeading}>
          <span><small>{copy.classSpecs}</small><h2>{className(currentClass)}</h2></span>
          <span>{copy.variants(currentClass.specs.length)}</span>
        </div>
        <div className={styles.specList}>
          {currentClass.specs.map((spec) => {
            const selected = spec.slug === current.slug;
            const RoleIcon = roleIcon[spec.role];
            const specNames = talentThemeNames(spec, lang);
            const href = `${localePrefix}/talents/${spec.slug}`;
            return (
              <Link
                className={selected ? styles.specSelected : undefined}
                key={spec.slug}
                href={href}
                prefetch
                data-route-scroll="keep"
                role="menuitem"
                aria-current={selected ? "page" : undefined}
                onClick={(event) => {
                  onClose();
                  navigateTalentPage(event, href, () => router.push(href, { scroll: false }));
                }}
                style={{ "--menu-spec-accent": spec.accent, "--menu-spec-hot": spec.hot, "--menu-spec-rgb": spec.accentRgb } as CSSProperties}
              >
                <span className={styles.specIcon}><Image src={spec.iconUrl} alt="" width={44} height={44} /></span>
                <span className={styles.specCopy}><b>{specNames.spec}</b><small><RoleIcon aria-hidden="true" />{specNames.role}</small>{specNames.fantasy ? <em>{specNames.fantasy}</em> : null}</span>
                <span className={styles.specState}>{selected ? <><Check aria-hidden="true" /><small>{copy.picked}</small></> : <><i aria-hidden="true" /><small>{copy.open}</small></>}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <footer className={styles.menuFooter}>
        <span><i aria-hidden="true" />{copy.footer}</span>
        <kbd>Esc</kbd>
      </footer>
    </section>,
    document.body,
  );
}
