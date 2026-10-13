import { ArrowLeft } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import { p } from "@/lib/i18n";
import styles from "./legal.module.css";

export type LegalProps = {
  title: string;
  /** "Last updated: …" line, already localized. */
  updated: string;
  sections: { heading: string; text: string }[];
  backLabel: string;
};

/** Legal/prose page on the atlas kit: archive artwork, h1 with the update date, a readable column of h2 + paragraph sections. */
function Legal({ title, updated, sections, backLabel, lang }: BlockComponentProps<LegalProps, undefined>) {
  return (
    <AtlasFrame as="div" lang={lang} scene="archiveDeep">
      <AtlasHero title={title} lede={updated} />
      <div className={styles.prose}>
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        <AtlasLinkButton href={p(lang, "/")} variant="ghost" size="sm" icon={<ArrowLeft aria-hidden="true" />} className={styles.back}>
          {backLabel.replace(/^←\s*/, "")}
        </AtlasLinkButton>
      </div>
    </AtlasFrame>
  );
}

export const legalBlock = defineBlock<LegalProps, undefined>({
  type: "legal",
  Component: Legal,
  demo: {
    props: {
      title: "Example policy",
      updated: "Last updated: today",
      sections: [{ heading: "Section", text: "Paragraph text." }],
      backLabel: "← Back to Gildra",
    },
    data: undefined,
    layout: "full",
  },
});
