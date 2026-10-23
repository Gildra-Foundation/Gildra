'use client';

import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../primitives';
import { AlertCircleIcon, InfoIcon, PencilIcon, RefreshIcon, TagIcon } from '../icons';
import { useLocale, useTimeZone } from '../theme/ThemeProvider';
import { formatArticleDateTime, isoDate, type DateInput } from './utils';
import './EditorNote.css';
import { withRef } from '../primitives/react-compat';

export type EditorNoteKind = 'update' | 'correction' | 'clarification' | 'disclosure' | 'sponsored';

export type EditorNoteLabels = Record<EditorNoteKind, string>;

const DEFAULT_LABELS: EditorNoteLabels = {
  update: 'Update',
  correction: 'Correction',
  clarification: 'Clarification',
  disclosure: 'Disclosure',
  sponsored: 'Sponsored',
};

const ICONS: Record<EditorNoteKind, typeof InfoIcon> = {
  update: RefreshIcon,
  correction: PencilIcon,
  clarification: InfoIcon,
  disclosure: AlertCircleIcon,
  sponsored: TagIcon,
};

export interface EditorNoteProps extends Omit<ComponentPropsWithRef<'aside'>, 'title'> {
  /** What the note is: an update to the story, a correction of an error, a clarification, a conflict-of-interest disclosure or a sponsorship notice. */
  kind?: EditorNoteKind;
  /**
   * `editorial` (default): a hairline above, the kind in small capitals with the date, the text in muted
   * italics, as newspapers print corrections. `callout`: a tinted box with an edge rule and an icon.
   */
  variant?: 'editorial' | 'callout';
  /** When the note was added. */
  date?: DateInput;
  /** Title in place of the kind's label. */
  title?: ReactNode;
  /** What changed and why. */
  children?: ReactNode;
  /** IANA time zone of the dates shown, e.g. "Europe/Moscow" (default: the ThemeProvider's, then the reader's). Set it, here or on the provider, when rendering on the server, so the server and the browser print the same time. */
  timeZone?: string;
  locale?: string;
  labels?: Partial<EditorNoteLabels>;
}

export const EditorNote = withRef(function EditorNote({
  kind = 'update',
  variant = 'editorial',
  date,
  title,
  children,
  timeZone: timeZoneProp,
  locale: localeProp,
  labels,
  className,
  ...rest
}: EditorNoteProps) {
  const locale = useLocale(localeProp);
  const timeZone = useTimeZone(timeZoneProp);
  const copy = { ...DEFAULT_LABELS, ...labels };
  const Icon = ICONS[kind];
  return (
    <aside
      className={cx('ui-editor-note', className)}
      data-kind={kind}
      data-variant={variant}
      data-bare={children == null || undefined}
      role="note"
      {...rest}
    >
      <Icon size={16} className="ui-editor-note__icon" aria-hidden="true" />
      <div className="ui-editor-note__body">
        <p className="ui-editor-note__head">
          <strong className="ui-editor-note__title">{title ?? copy[kind]}</strong>
          {date != null && (
            <time className="ui-editor-note__date" dateTime={isoDate(date)}>
              {formatArticleDateTime(date, locale, timeZone)}
            </time>
          )}
        </p>
        {children != null && <div className="ui-editor-note__text">{children}</div>}
      </div>
    </aside>
  );
});
