import { Fragment } from "react";
import Link from "next/link";
import { defineBlock, type BlockComponentProps } from "@/lib/blocks/types";
import { p } from "@/lib/i18n";

export type LegalProps = {
  title: string;
  /** "Last updated: …" line, already localized. */
  updated: string;
  sections: { heading: string; text: string }[];
  backLabel: string;
};

/** Narrow legal/prose page (`.legal`): h1, updated line, h2 + paragraph sections, back link. */
function Legal({ title, updated, sections, backLabel, lang }: BlockComponentProps<LegalProps, undefined>) {
  return (
    <div className="section route-section legal">
      <h1>{title}</h1>
      <p className="legal-upd">{updated}</p>
      {sections.map((s) => (
        <Fragment key={s.heading}>
          <h2>{s.heading}</h2>
          <p>{s.text}</p>
        </Fragment>
      ))}
      <p className="legal-back">
        <Link className="btn-line" href={p(lang, "/")}>
          {backLabel}
        </Link>
      </p>
    </div>
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
