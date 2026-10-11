import { cmsConfig } from "@/lib/cms/config";
import type { RichTextDocument } from "@/lib/cms/contract";
import { renderRichText } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { articleHref, localizeSitePath } from "./paths";
import blocks from "./blocks.module.css";
import styles from "./cms.module.css";

const CALLOUT_LABELS = {
  en: { info: "Note", tip: "Tip", warning: "Careful" },
  ru: { info: "На заметку", tip: "Совет", warning: "Осторожно" },
} as const;

const BLOCK_LABELS = {
  en: { pros: "Pros", cons: "Cons", video: "Video" },
  ru: { pros: "Плюсы", cons: "Минусы", video: "Видео" },
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
    blockLabels: BLOCK_LABELS[lang],
    embedParent: new URL(config.publicOrigin).hostname,
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
      video: blocks.video,
      videoFrame: blocks.videoFrame,
      videoCaption: blocks.videoCaption,
      details: blocks.details,
      detailsSummary: blocks.detailsSummary,
      detailsBody: blocks.detailsBody,
      prosCons: blocks.prosCons,
      pros: blocks.pros,
      cons: blocks.cons,
      prosConsTitle: blocks.prosConsTitle,
      steps: blocks.steps,
      stepTitle: blocks.stepTitle,
      stepBody: blocks.stepBody,
      button: blocks.button,
      buttonSecondary: blocks.buttonSecondary,
    },
  });
}
