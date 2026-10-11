"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import { getTalentSpecTheme, talentSpecClasses } from "@/lib/talentSpecThemes";
import styles from "./rotationSpecMenu.module.css";

type MenuCopy = { label: string; title: string; text: string };

/** Spec switcher of the Rotation Lab toolbar. The list renders only while open. */
export function RotationSpecMenu({ activeSlug, lang, copy }: { activeSlug: string; lang: "en" | "ru"; copy: MenuCopy }) {
  const active = getTalentSpecTheme(activeSlug);
  const ru = lang === "ru";
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => { if (menu.current) menu.current.open = false; };

  return (
    <details ref={menu} className={styles.menu} onToggle={(event) => setOpen(event.currentTarget.open)} onKeyDown={(event) => { if (event.key === "Escape" && open) { close(); menu.current?.querySelector("summary")?.focus(); } }}>
      <summary aria-label={copy.label}>
        {active ? <Image src={active.iconUrl} alt="" width={24} height={24} unoptimized /> : null}
        <span>{active ? (ru ? active.specNameRu : active.specName) : activeSlug}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      {open ? (
        <div className={styles.panel}>
          <p className={styles.heading}><strong>{copy.title}</strong><span>{copy.text}</span></p>
          <div className={styles.classes}>
            {talentSpecClasses.map((group) => (
              <section key={group.classKey} className={styles.group} aria-label={ru ? group.classNameRu : group.specs[0].className}>
                <h3>{ru ? group.classNameRu : group.specs[0].className}</h3>
                <ul>
                  {group.specs.map((spec) => {
                    const selected = spec.slug === activeSlug;
                    return (
                      <li key={spec.slug}>
                        <Link href={`${ru ? "/ru" : ""}/wow/rotation/${spec.slug}`} aria-current={selected ? "page" : undefined} onClick={close} style={{ "--spec-accent-rgb": spec.accentRgb } as CSSProperties}>
                          <Image src={spec.iconUrl} alt="" width={32} height={32} loading="lazy" unoptimized />
                          <span><strong>{ru ? spec.specNameRu : spec.specName}</strong><small>{ru ? spec.roleRu : spec.role}</small></span>
                          {selected ? <Check aria-hidden="true" /> : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}
