'use client';

import { createElement, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../primitives';
import { FileTextIcon, MessageCircleIcon } from '../icons';
import { useLocale, useTimeZone } from '../theme/ThemeProvider';
import {
  formatArticleDate,
  formatCompactNumber,
  formatInteger,
  isoDate,
  type ArticleAuthor,
  type DateInput,
  type EditorialHeadingLevel,
} from './utils';
import './ArticleCard.css';
import { fetchPriorityAttr, withRef } from '../primitives/react-compat';

export interface ArticleCardLabels {
  readingTime: (minutes: number, formatted: string) => string;
  comments: (count: number, formatted: string) => string;
}

const DEFAULT_LABELS: ArticleCardLabels = {
  readingTime: (_minutes, formatted) => `${formatted} min read`,
  comments: (count, formatted) => `${formatted} ${count === 1 ? 'comment' : 'comments'}`,
};

export interface ArticleCardProps extends Omit<ComponentPropsWithRef<'article'>, 'title'> {
  /** Headline of the story. */
  title: ReactNode;
  /** Story URL; the whole card becomes clickable through the headline link. */
  href?: string;
  /** Teaser text under the headline. */
  excerpt?: ReactNode;
  /** Rubric above the headline: "Analysis", "Opinion". */
  kicker?: ReactNode;
  /** Label over the image corner: "Video", "Exclusive", "Live". */
  badge?: ReactNode;
  /** The image element itself (`next/image`, `<picture>`), in place of `imageSrc`; it fills the card's media box. */
  image?: ReactNode;
  /** Lead image; without it a quiet placeholder keeps a grid of cards even, and a horizontal card drops its image column. */
  imageSrc?: string;
  /** Text alternative of the image (default "": the headline already names the story). */
  imageAlt?: string;
  /** Responsive sources for the image ("card-400.jpg 400w, card-800.jpg 800w"): a feed of cards then downloads thumbnails, not originals. */
  imageSrcSet?: string;
  /** Display widths for imageSrcSet (default "(min-width: 48rem) 33vw, 100vw"). */
  imageSizes?: string;
  /** A card above the fold (the lead story): its image loads at once with high priority instead of lazily. */
  priority?: boolean;
  /** Writers shown in the meta line (names only). */
  authors?: ArticleAuthor[];
  /** Publication date. */
  published?: DateInput;
  /** Estimated reading time in minutes. */
  readingMinutes?: number;
  /** Number of reader comments. */
  commentCount?: number;
  /** `vertical`: image on top (default); `horizontal`: image beside the text; `overlay`: text over the image. */
  layout?: 'vertical' | 'horizontal' | 'overlay';
  /** Level of the headline (default 3). */
  headingLevel?: EditorialHeadingLevel;
  /** IANA time zone of the dates shown, e.g. "Europe/Moscow" (default: the ThemeProvider's, then the reader's). Set it, here or on the provider, when rendering on the server, so the server and the browser print the same time. */
  timeZone?: string;
  locale?: string;
  labels?: Partial<ArticleCardLabels>;
}

export const ArticleCard = withRef(function ArticleCard({
  title,
  href,
  excerpt,
  kicker,
  badge,
  image,
  imageSrc,
  imageAlt = '',
  imageSrcSet,
  imageSizes = '(min-width: 48rem) 33vw, 100vw',
  priority = false,
  authors = [],
  published,
  readingMinutes,
  commentCount,
  layout = 'vertical',
  headingLevel = 3,
  timeZone: timeZoneProp,
  locale: localeProp,
  labels,
  className,
  ...rest
}: ArticleCardProps) {
  const locale = useLocale(localeProp);
  const timeZone = useTimeZone(timeZoneProp);
  const copy = { ...DEFAULT_LABELS, ...labels };
  const meta: ReactNode[] = [];
  if (authors.length) meta.push(<span key="authors" className="ui-article-card__authors">{authors.map((a) => a.name).join(', ')}</span>);
  if (published != null && isoDate(published)) {
    meta.push(
      <time key="date" dateTime={isoDate(published)}>
        {formatArticleDate(published, locale, timeZone)}
      </time>,
    );
  }
  if (readingMinutes != null && readingMinutes > 0) {
    // The label gets the number it shows (plural rules need the rounded value).
    const minutes = Math.max(1, Math.round(readingMinutes));
    meta.push(<span key="reading">{copy.readingTime(minutes, formatInteger(minutes, locale))}</span>);
  }
  if (commentCount != null && commentCount > 0) {
    const label = copy.comments(commentCount, formatInteger(commentCount, locale));
    meta.push(
      <span key="comments" className="ui-article-card__comments" title={label}>
        <MessageCircleIcon size={14} aria-hidden="true" />
        <span aria-hidden="true">{formatCompactNumber(commentCount, locale)}</span>
        <span className="ui-sr-only">{label}</span>
      </span>,
    );
  }

  // A horizontal card in a feed reads better as plain text than beside an empty placeholder.
  const showMedia = image != null || !!imageSrc || layout !== 'horizontal';
  const badgeEl = badge != null && <span className="ui-article-card__badge">{badge}</span>;

  return (
    <article
      className={cx('ui-article-card', className)}
      data-layout={layout}
      data-linked={href ? true : undefined}
      data-no-media={showMedia ? undefined : true}
      {...rest}
    >
      {showMedia && (
        <div className="ui-article-card__media">
          {image ?? (imageSrc ? (
            <img
              className="ui-article-card__img"
              src={imageSrc}
              srcSet={imageSrcSet}
              sizes={imageSrcSet ? imageSizes : undefined}
              alt={imageAlt}
              loading={priority ? 'eager' : 'lazy'}
              {...fetchPriorityAttr(priority ? 'high' : undefined)}
              decoding="async"
            />
          ) : (
            <span className="ui-article-card__placeholder" aria-hidden="true">
              <FileTextIcon size={28} strokeWidth={1.25} />
            </span>
          ))}
          {badgeEl}
        </div>
      )}
      <div className="ui-article-card__body">
        {!showMedia && badgeEl}
        {kicker != null && <p className="ui-article-card__kicker">{kicker}</p>}
        {createElement(
          `h${headingLevel}`,
          { className: 'ui-article-card__title' },
          href ? (
            <a className="ui-article-card__link" href={href}>
              {title}
            </a>
          ) : (
            title
          ),
        )}
        {excerpt != null && <p className="ui-article-card__excerpt">{excerpt}</p>}
        {meta.length > 0 && (
          <p className="ui-article-card__meta">
            {/* A separator wraps with the item after it, so no line ends on a dangling dot. */}
            {meta.map((item, index) =>
              index === 0 ? (
                item
              ) : (
                <span key={`item-${index}`} className="ui-article-card__meta-item">
                  <span className="ui-article-card__dot" aria-hidden="true">
                    ·
                  </span>
                  {item}
                </span>
              ),
            )}
          </p>
        )}
      </div>
    </article>
  );
});
