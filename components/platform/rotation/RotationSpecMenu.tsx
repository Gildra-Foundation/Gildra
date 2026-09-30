"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";
import { Check, ChevronDown, Layers3 } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { getTalentSpecTheme, talentSpecClasses } from "@/lib/talentSpecThemes";
import styles from "./rotationLab.module.css";

export function RotationSpecMenu({ activeSlug, lang }: { activeSlug: string; lang: Lang }) {
  const active = getTalentSpecTheme(activeSlug);
  const ru = lang === "ru";
  const [open, setOpen] = useState(false);

  return (
    <details className={styles.specMenu} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-label={ru ? "Выбрать специализацию" : "Choose specialization"}>
        <span>{active ? (ru ? active.specNameRu : active.specName) : activeSlug}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      {open && <div className={styles.specMenuPanel}>
        <header>
          <span><Layers3 aria-hidden="true" /></span>
          <div>
            <strong>{ru ? "Выберите специализацию" : "Choose a specialization"}</strong>
            <small>{ru ? "Способности, ресурс и тренировки сменятся вместе со спеком" : "Abilities, resource, and drills change with your spec"}</small>
          </div>
        </header>
        <div className={styles.specMenuClasses}>
          {talentSpecClasses.map((group) => (
            <section key={group.classKey} className={styles.specMenuClass}>
              <h3>{ru ? group.classNameRu : group.specs[0].className}</h3>
              <div>
                {group.specs.map((spec) => {
                  const selected = spec.slug === activeSlug;
                  return (
                    <Link
                      key={spec.slug}
                      href={`${ru ? "/ru" : ""}/wow/rotation/${spec.slug}`}
                      aria-current={selected ? "page" : undefined}
                      className={selected ? styles.specMenuActive : ""}
                      style={{ "--spec-menu-accent": spec.accent, "--spec-menu-rgb": spec.accentRgb } as CSSProperties}
                    >
                      <Image src={spec.iconUrl} alt="" width={36} height={36} sizes="36px" quality={85} loading="lazy" unoptimized />
                      <span><strong>{ru ? spec.specNameRu : spec.specName}</strong><small>{ru ? spec.roleRu : spec.role}</small></span>
                      {selected && <Check aria-hidden="true" />}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>}
    </details>
  );
}
