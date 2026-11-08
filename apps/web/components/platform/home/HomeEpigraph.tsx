import type { Lang } from "@/lib/i18n";
import { WrittenEpigraph } from "./WrittenEpigraph";

const epigraphs = {
  // Arthas epigraph with the continuation requested by the user; EN is our translation.
  arthas: {
    ru: { quote: "«Я с радостью приму на себя проклятие, если это поможет спасти мою родину! К черту людей! Я буду мстить, и никто не встанет у меня на пути, даже ты.»", author: "Артас Менетил" },
    en: { quote: "“I would gladly bear any curse to save my homeland. Damn the men! Nothing shall prevent me from having my revenge, old friend. Not even you.”", author: "Arthas Menethil" },
  },
};

export function HomeEpigraph({ lang }: { lang: Lang }) {
  const { quote, author } = epigraphs.arthas[lang];

  return <>
    <WrittenEpigraph lang={lang} quote={quote} author={author} extended />
  </>;
}
