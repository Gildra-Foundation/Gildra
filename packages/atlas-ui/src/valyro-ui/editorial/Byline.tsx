'use client';

import type { ComponentPropsWithRef } from 'react';
import { cx } from '../primitives';
import { useLocale, useTimeZone } from '../theme/ThemeProvider';
import { Avatar } from '../basic/Avatar';
import {
  formatArticleDate,
  formatArticleDateTime,
  formatInteger,
  isoDate,
  joinNames,
  type ArticleAuthor,
  type DateInput,
} from './utils';
import './Byline.css';
import { withRef } from '../primitives/react-compat';

export interface BylineLabels {
  /** Lead-in before the names. */
  by: string;
  /** Joins the last two names. */
  and: string;
  /** Before the update date. */
  updated: string;
  readingTime: (minutes: number, formatted: string) => string;
}

const DEFAULT_LABELS: BylineLabels = {
  by: 'By',
  and: 'and',
  updated: 'Updated',
  readingTime: (_minutes, formatted) => `${formatted} min read`,
};

export interface BylineProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Writers credited on the piece; each name links to `href` when given. */
  authors: ArticleAuthor[];
  /** Publication date. */
  published?: DateInput;
  /** Last substantive update; shown with its time of day. */
  updated?: DateInput;
  /** Estimated reading time in minutes. */
  readingMinutes?: number;
  /** Avatars of the authors before the names (default true). */
  showAvatars?: boolean;
  /** `sm` for cards and lists, `md` under a headline (default). */
  size?: 'sm' | 'md';
  /** IANA time zone of the dates shown, e.g. "Europe/Moscow" (default: the ThemeProvider's, then the reader's). Set it, here or on the provider, when rendering on the server, so the server and the browser print the same time. */
  timeZone?: string;
  locale?: string;
  labels?: Partial<BylineLabels>;
}

export const Byline = withRef(function Byline({
  authors,
  published,
  updated,
  readingMinutes,
  showAvatars = true,
  size = 'md',
  timeZone: timeZoneProp,
  locale: localeProp,
  labels,
  className,
  ...rest
}: BylineProps) {
  const locale = useLocale(localeProp);
  const timeZone = useTimeZone(timeZoneProp);
  const copy = { ...DEFAULT_LABELS, ...labels };
  const avatars = showAvatars ? authors.filter((a) => a.name).slice(0, 3) : [];
  const roles = authors.length === 1 ? authors[0].role : undefined;
  const meta = [
    published != null && isoDate(published) && (
      <time key="published" dateTime={isoDate(published)} title={formatArticleDateTime(published, locale, timeZone)}>
        {formatArticleDate(published, locale, timeZone)}
      </time>
    ),
    updated != null && isoDate(updated) && (
      <span key="updated">
        {copy.updated}{' '}
        <time dateTime={isoDate(updated)}>{formatArticleDateTime(updated, locale, timeZone)}</time>
      </span>
    ),
    readingMinutes != null && readingMinutes > 0 && (
      <span key="reading">{copy.readingTime(Math.max(1, Math.round(readingMinutes)), formatInteger(Math.max(1, Math.round(readingMinutes)), locale))}</span>
    ),
  ].filter(Boolean);

  return (
    <div className={cx('ui-byline', className)} data-size={size} {...rest}>
      {avatars.length > 0 && (
        <span className="ui-byline__avatars" aria-hidden="true">
          {avatars.map((author) => (
            <Avatar key={author.name} name={author.name} src={author.avatarSrc} size={size === 'sm' ? 'sm' : 'md'} className="ui-byline__avatar" />
          ))}
        </span>
      )}
      <div className="ui-byline__text">
        {authors.length > 0 && (
          <p className="ui-byline__names">
            <span className="ui-byline__by">{copy.by} </span>
            {joinNames(authors, copy.and, (author) =>
              author.href ? (
                <a key={author.name} className="ui-byline__name" href={author.href} rel="author">
                  {author.name}
                </a>
              ) : (
                <span key={author.name} className="ui-byline__name">
                  {author.name}
                </span>
              ),
            )}
            {roles && <span className="ui-byline__role">, {roles}</span>}
          </p>
        )}
        {meta.length > 0 && (
          <p className="ui-byline__meta">
            {/* A separator wraps with the item after it, so no line ends on a dangling dot. */}
            {meta.map((item, index) =>
              index === 0 ? (
                item
              ) : (
                <span key={`item-${index}`} className="ui-byline__meta-item">
                  <span className="ui-byline__dot" aria-hidden="true">
                    ·
                  </span>
                  {item}
                </span>
              ),
            )}
          </p>
        )}
      </div>
    </div>
  );
});
