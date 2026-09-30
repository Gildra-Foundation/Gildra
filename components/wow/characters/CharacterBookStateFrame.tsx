import type { CSSProperties, ReactNode } from "react";
import { CharacterBookBackdrop } from "@/components/wow/audit/CharacterBookBackdrop";
import { PhysicalBookFrame, physicalBookMaterials } from "@/components/wow/audit/PhysicalBookFrame";
import surface from "@/components/wow/audit/characterBookSurface.module.css";
import grimoire from "@/components/wow/audit/grimoireControls.module.css";
import typography from "@/components/wow/audit/grimoireTypography.module.css";
import illumination from "@/components/wow/audit/characterBookIllumination.module.css";
import { CharacterBookRibbon } from "./CharacterBookRibbon";
import { CharacterBookMasthead } from "./CharacterBookMasthead";
import styles from "./characterBookStateFrame.module.css";

/** Shared manuscript shell for real profile loading and API error states. */
export function CharacterBookStateFrame({ children, locale, englishHref, russianHref }: {
  children: ReactNode; locale: "en" | "ru"; englishHref: string; russianHref: string;
}) {
  const ru = locale === "ru";
  return (
    <div
      className={`${styles.page} ${surface.root} ${typography.typography} ${grimoire.theme} ${illumination.page}`}
      data-character-book="open"
      lang={locale}
      style={physicalBookMaterials as CSSProperties}
    >
      <div className={`${surface.backdrop} ${styles.backdrop}`} data-character-book-backdrop aria-hidden="true">
        <CharacterBookBackdrop />
      </div>
      <div className={`${surface.content} ${styles.bookContent}`}>
        <section className={`${surface.manuscript} ${styles.manuscript}`}>
          <PhysicalBookFrame />
          <CharacterBookRibbon
            locale={locale}
            contents={ru ? "Содержание" : "Contents"}
            title={ru ? "Герой" : "Hero"}
            homeHref={ru ? "/ru/wow/characters" : "/wow/characters"}
            englishHref={englishHref}
            russianHref={russianHref}
            items={[{ number: "01", label: ru ? "Персонажи" : "Characters", href: ru ? "/ru/wow/characters" : "/wow/characters" }, { number: "02", label: ru ? "Состояние профиля" : "Profile status", href: "#profile-error", active: true }]}
          />
          <CharacterBookMasthead locale={locale} rightLabel={ru ? "Летопись героя" : "Hero chronicle"} />
          {children}
        </section>
      </div>
    </div>
  );
}
