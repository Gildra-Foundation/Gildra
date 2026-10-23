'use client';

import { createElement, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../primitives';
import type { EditorialHeadingLevel } from './utils';
import './KeyPoints.css';
import { withRef, useId } from '../primitives/react-compat';

export interface KeyPointsLabels {
  title: string;
}

const DEFAULT_LABELS: KeyPointsLabels = {
  title: 'Key points',
};

export interface KeyPointsProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** The takeaways, one short sentence each. */
  items: ReactNode[];
  /** Numbers the points (an ordered list) instead of bullets. */
  numbered?: boolean;
  /** `box`: a tinted panel (default); `rule`: a bar along the start edge with no fill. */
  variant?: 'box' | 'rule';
  /** Level of the title (default 2). */
  headingLevel?: EditorialHeadingLevel;
  labels?: Partial<KeyPointsLabels>;
}

export const KeyPoints = withRef(function KeyPoints({ items, numbered = false, variant = 'box', headingLevel = 2, labels, className, ...rest }: KeyPointsProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const titleId = useId();
  const List = numbered ? 'ol' : 'ul';
  return (
    <div className={cx('ui-key-points', className)} data-variant={variant} {...rest}>
      {createElement(`h${headingLevel}`, { id: titleId, className: 'ui-key-points__title' }, copy.title)}
      <List className="ui-key-points__list" role="list" aria-labelledby={titleId} data-numbered={numbered || undefined}>
        {items.map((item, index) => (
          <li key={index} className="ui-key-points__item">
            {item}
          </li>
        ))}
      </List>
    </div>
  );
});
