import { BookEngraving } from "@/components/wow/audit/BookEngraving";
import illumination from "@/components/wow/audit/characterBookIllumination.module.css";

/** One shared printed masthead for login, roster, profile and profile states. */
export function CharacterBookMasthead({ locale, rightLabel }: { locale: "en" | "ru"; rightLabel: string }) {
  return (
    <div className={illumination.masthead} aria-hidden="true">
      <span>{locale === "ru" ? "МИР WARCRAFT" : "WORLD OF WARCRAFT"}</span>
      <BookEngraving motif="compass" />
      <span>{rightLabel}</span>
    </div>
  );
}
