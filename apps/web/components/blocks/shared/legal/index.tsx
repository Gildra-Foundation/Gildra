import { ArrowLeft } from "lucide-react";
import { formatAtlasDate } from "@gildra/atlas-ui/format";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import { p } from "@/lib/i18n";
import { trailLabel } from "@/lib/routes/registry";
import styles from "./legal.module.css";

export type LegalProps = {
  title: string;
  /** One sentence: what the document covers. */
  lede: string;
  /** ISO date of the last change (shown through formatAtlasDate) and its label ("Updated"). */
  updated: string;
  updatedLabel: string;
  /** Breadcrumbs; hrefs are language-less and get the page's prefix. */
  crumbs: { label: string; href?: string }[];
  sections: { heading: string; text: string }[];
  backLabel: string;
};

/** Legal/prose page on the atlas kit: archive artwork, h1 with the update date, a readable column of h2 + paragraph sections. */
function Legal({ title, lede, updated, updatedLabel, crumbs, sections, backLabel, lang }: BlockComponentProps<LegalProps, undefined>) {
  return (
    <AtlasFrame as="div" lang={lang} scene="archiveDeep">
      <AtlasHero title={title} lede={lede}
        eyebrow={`${updatedLabel} ${formatAtlasDate(updated, lang)}`}
        breadcrumbs={crumbs.map(crumb => crumb.href ? { ...crumb, href: p(lang, crumb.href) } : crumb)}
        breadcrumbsLabel={trailLabel(lang)} />
      <div className={styles.prose}>
        {sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.text}</p>
          </section>
        ))}
        <AtlasLinkButton href={p(lang, "/")} variant="ghost" size="sm" icon={<ArrowLeft aria-hidden="true" />} className={styles.back}>
          {backLabel}
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
      lede: "What the policy covers.",
      updated: "2026-10-23",
      updatedLabel: "Updated",
      crumbs: [{ label: "Gildra", href: "/" }, { label: "Policy" }],
      sections: [{ heading: "Section", text: "Paragraph text." }],
      backLabel: "Back to Gildra",
    },
    data: undefined,
    layout: "full",
  },
});
