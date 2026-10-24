"use client";

import type { Lang } from "@/lib/i18n";
import { useHomeTheme } from "./HomeTheme";
import { homeThemes, type HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const epigraphs = {
  // Arthas epigraph with the continuation requested by the user; EN is our translation.
  arthas: {
    ru: { quote: "«Я с радостью приму на себя проклятие, если это поможет спасти мою родину! К черту людей! Я буду мстить, и никто не встанет у меня на пути, даже ты.»", author: "Артас Менетил" },
    en: { quote: "“I would gladly bear any curse to save my homeland. Damn the men! Nothing shall prevent me from having my revenge, old friend. Not even you.”", author: "Arthas Menethil" },
  },
  // Illidan's original dialogue: user-supplied RU and EN from the game screenshot.
  illidan: {
    ru: { quote: "«Я свободен! После десяти тысяч лет тюрмы. Но мой родной брат по прежнему считает меня подлецом. Я покажу ему свою истинную силу! Я докажу, что демоны не властны над мной»", author: "Иллидан Ярость Бури" },
    en: { quote: "“I am free after ten thousand years, yet still my own brother thinks I am a villain! I'll show him my true power! I'll show him that the demons have no hold over me!”", author: "Illidan Stormrage" },
  },
  // User-written Garek epigraph; EN is our translation.
  garek: {
    ru: { quote: "«Свет покинул эти земли не тогда, когда пал Лордерон. Он ушел, когда мы отвернулись друг от друга.»", author: "Гарек Бандарион" },
    en: { quote: "“The Light did not leave these lands when Lordaeron fell. It left when we turned our backs on one another.”", author: "Garek Bandarion" },
  },
  // Adapted composite of Saurfang's loyalty/honor dialogue and Reckoning.
  // https://www.wowhead.com/news/new-saurfang-cinematic-old-soldier-286103?page=13
  // https://worldofwarcraft.blizzard.com/en-us/media/video/reckoning
  varok: {
    ru: { quote: "«Не путай верность и честь. Молись, чтобы тебе не пришлось выбирать между ними. Пока мы стоим вместе, нашу надежду не сломить. Орда выстоит. Орда сильна.»", author: "Варок Саурфанг" },
    en: { quote: "“Loyalty and honor are not the same. Pray you never have to choose between them. As long as we stand together, our hope cannot be broken. The Horde will endure. The Horde is strong.”", author: "Varok Saurfang" },
  },
} satisfies Record<HomeThemeId, Record<Lang, { quote: string; author: string }>>;

export function HomeEpigraph({ lang }: { lang: Lang }) {
  const { theme } = useHomeTheme();
  const ru = lang === "ru";
  const { quote, author } = epigraphs[theme][lang];
  const hero = homeThemes.find(item => item.id === theme)!;

  return <>
    <p className={styles.eyebrow}><span aria-hidden="true" />{ru ? "ХРОНИКИ АЗЕРОТА" : "CHRONICLES OF AZEROTH"} / {(ru ? hero.ru : hero.en).toUpperCase()}</p>
    <figure className={styles.epigraph}>
      <blockquote><h1 className={`${styles.quoteText}${theme !== "garek" ? ` ${styles.longQuote}` : ""}`}>{quote}</h1></blockquote>
      <figcaption className={styles.quoteAuthor}><span aria-hidden="true" /><cite>{author}</cite></figcaption>
    </figure>
  </>;
}
