import { BookOpen, LockKeyhole, Shield, Users } from "lucide-react";
import { BookEngraving } from "@/components/wow/audit/BookEngraving";
import styles from "./characterEntryGuide.module.css";

type Locale = "en" | "ru";

const proofCopy = {
  en: [
    ["A real character roster", "Names, realms, classes, races, and levels come from your Battle.net profile."],
    ["Official profile source", "Gildra does not fill the page with sample or invented characters."],
    ["You choose what to inspect", "Open one character to see its equipment, talents, and combat tools."],
  ],
  ru: [
    ["Настоящий список героев", "Имена, серверы, классы, расы и уровни придут из профиля Battle.net."],
    ["Источник — Blizzard", "Gildra не подставляет тестовых и выдуманных персонажей."],
    ["Ты сам выбираешь чара", "Открой героя, чтобы посмотреть экипировку, таланты и боевые инструменты."],
  ],
} as const;

type EntryStep = readonly [title: string, description: string];
type RoadmapCopy = { eyebrow: string; title: string; intro: string; steps: readonly EntryStep[]; colophon: string };

const roadmapCopy: Record<Locale, RoadmapCopy> = {
  en: {
    eyebrow: "THE HERO’S PATH",
    title: "From Battle.net to your hero’s folio",
    intro: "Connect your account, choose a character, then open its equipment and combat tools.",
    steps: [
      ["Connect Battle.net", "Approve access securely on Blizzard’s sign-in page."],
      ["Sync your roster", "Load names, realms, classes, and races from the official profile."],
      ["Choose your hero", "Filter the returned characters and open the one you want."],
      ["Open the character folio", "Review equipment, talents, and combat tools for that hero."],
    ],
    colophon: "Character details are loaded from your Battle.net profile",
  },
  ru: {
    eyebrow: "ПУТЬ ГЕРОЯ",
    title: "От Battle.net — к книге твоего героя",
    intro: "Подключи аккаунт, выбери персонажа и открой его экипировку и боевые инструменты.",
    steps: [
      ["Подключи Battle.net", "Подтверди безопасный вход на странице Blizzard."],
      ["Загрузи ростер", "Имена, серверы, классы и расы придут из официального профиля."],
      ["Выбери героя", "Отфильтруй персонажей и открой нужного."],
      ["Открой книгу героя", "Изучи экипировку, таланты и боевые инструменты чара."],
    ],
    colophon: "Данные персонажей загружаются из твоего профиля Battle.net",
  },
};

export function CharacterEntryProof({ locale }: { locale: Locale }) {
  const copy = proofCopy[locale];
  const icons = [Users, Shield, BookOpen];
  return (
    <ul className={styles.proof}>
      {copy.map(([title, description], index) => {
        const Icon = icons[index];
        return <li key={title}><Icon aria-hidden="true" /><span><b>{title}</b>{description}</span></li>;
      })}
    </ul>
  );
}

export function CharacterEntryRoadmap({ locale }: { locale: Locale }) {
  const copy = roadmapCopy[locale];
  const icons = [LockKeyhole, Shield, Users, BookOpen];
  const stepList = (start: number, steps: readonly EntryStep[]) => (
    <ol className={styles.steps} start={start}>
      {steps.map(([title, description], offset) => {
        const index = start - 1 + offset;
        const Icon = icons[index];
        return <li key={title}><span className={styles.stepIcon}><Icon aria-hidden="true" /></span><div><small>{String(index + 1).padStart(2, "0")}</small><h3>{title}</h3><p>{description}</p></div></li>;
      })}
    </ol>
  );

  return (
    <>
    <div className={styles.divider} data-folio-divider aria-hidden="true" />
    <section className={styles.roadmap} aria-label={copy.title}>
      <div className={styles.spread}>
        <div className={styles.leftLeaf}>
          <div className={styles.heading}>
            <span className={styles.seal} aria-hidden="true"><BookEngraving motif="armory" /></span>
            <div><small>{copy.eyebrow}</small><h2>{copy.title}</h2><p>{copy.intro}</p></div>
          </div>
          {stepList(1, copy.steps.slice(0, 2))}
        </div>
        <div className={styles.rightLeaf}>
          {stepList(3, copy.steps.slice(2))}
          <div className={styles.colophon}><span />{copy.colophon}</div>
        </div>
      </div>
    </section>
    </>
  );
}
