import { cmsConfig } from "@/lib/cms/config";
import type { RichTextDocument } from "@/lib/cms/contract";
import { renderRichText } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { articleHref, localizeSitePath } from "./paths";
import styles from "./cms.module.css";

const CALLOUT_LABELS = {
  en: { info: "Note", tip: "Tip", warning: "Careful" },
  ru: { info: "На заметку", tip: "Совет", warning: "Осторожно" },
} as const;

/** Server-rendered CMS rich text with Gildra's link, media and style rules. */
export function CmsRichText({ content, lang }: { content: RichTextDocument; lang: Lang }) {
  const config = cmsConfig();
  return renderRichText(content, {
    mediaOrigins: config.mediaOrigins,
    mediaBase: config.publicUrl || undefined,
    resolveDocHref: (relationTo, slug) => (relationTo === "guides" ? articleHref(lang, slug) : null),
    localizeHref: (href) => localizeSitePath(lang, href),
    calloutLabels: CALLOUT_LABELS[lang],
    classNames: {
      prose: styles.prose,
      callout: styles.callout,
      calloutTitle: styles.calloutTitle,
      calloutBody: styles.calloutBody,
      table: styles.table,
      tableWrap: styles.tableWrap,
      figure: styles.figure,
      image: styles.image,
      caption: styles.caption,
      quote: styles.quote,
    },
  });
}
