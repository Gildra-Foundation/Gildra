'use client';

import { createElement, useEffect, useRef, type ComponentPropsWithRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { cx, useControllableState, useLatest } from '../primitives';
import { ChevronDownIcon } from '../icons';
import { isMotionReduced } from '../motion-kit/preference';
import type { EditorialHeadingLevel } from './utils';
import './ArticleToc.css';
import { withRef, useId } from '../primitives/react-compat';

export interface ArticleTocItem {
  /** `id` of the heading in the article. */
  id: string;
  label: ReactNode;
  /** Nesting: 1 for sections (default), 2–3 for subsections. */
  level?: 1 | 2 | 3;
}

export interface ArticleTocLabels {
  title: string;
}

const DEFAULT_LABELS: ArticleTocLabels = {
  title: 'Contents',
};

export interface ArticleTocProps extends Omit<ComponentPropsWithRef<'nav'>, 'children'> {
  /** Headings of the article, in reading order. */
  items: ArticleTocItem[];
  /** Section being read (controlled). */
  activeId?: string;
  /** Initial section when uncontrolled. */
  defaultActiveId?: string;
  /** Called when scrolling reaches another section or a link is followed. */
  onActiveIdChange?: (id: string) => void;
  /** Follow the scroll position and mark the section being read (default true). */
  track?: boolean;
  /** Distance in px from the top of the viewport (or `container`) at which a heading counts as reached (default 96, below a sticky header). */
  offset?: number;
  /** Scrolling element that holds the article, when it is not the window (a reader pane, a modal). */
  container?: RefObject<HTMLElement | null>;
  /** Put the section's `#id` in the address on click (default true), so it can be copied and shared. Turn it off in apps whose router reads the hash. */
  updateHash?: boolean;
  /** Scroll smoothly to the section on click (default true; off when the reader prefers reduced motion). */
  smooth?: boolean;
  /** Level of the title (default 2). */
  headingLevel?: EditorialHeadingLevel;
  /**
   * Fold the list under its title, a native disclosure that starts closed: for contents placed above
   * the text on a phone rather than beside it.
   */
  collapsible?: boolean;
  labels?: Partial<ArticleTocLabels>;
}

export const ArticleToc = withRef(function ArticleToc({
  items,
  activeId: activeIdProp,
  defaultActiveId,
  onActiveIdChange,
  track = true,
  offset = 96,
  container,
  updateHash = true,
  smooth = true,
  headingLevel = 2,
  collapsible = false,
  labels,
  className,
  ...rest
}: ArticleTocProps) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const titleId = useId();
  const [activeId, setActiveId] = useControllableState({
    value: activeIdProp,
    defaultValue: defaultActiveId ?? '',
    onChange: onActiveIdChange,
  });
  const activeRef = useLatest(activeId);
  // A click scrolls past other sections; keep its target until that scroll ends.
  const locked = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lockToken = useRef(0);
  useEffect(() => () => clearTimeout(unlockTimer.current), []);
  // The last id reported, so a parent that does not store it is not called on every scroll frame.
  const reported = useRef(activeId);
  const idsKey = items.map((item) => item.id).join('\n');

  useEffect(() => {
    reported.current = activeId;
  }, [activeId]);

  useEffect(() => {
    if (!track || typeof window === 'undefined') return;
    const ids = idsKey ? idsKey.split('\n') : [];
    const scroller = container?.current ?? null;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (locked.current) return;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      let current = '';
      for (const id of ids) {
        const heading = document.getElementById(id);
        if (!heading) continue;
        if (heading.getBoundingClientRect().top - top - offset <= 1) current = id;
        else break;
      }
      // Above the first heading (a lead, a margin before it): the reader is about to start the first section.
      if (!current && ids.length) current = ids[0];
      // At the very bottom the last short section may never reach the offset line.
      const root = scroller ?? document.scrollingElement;
      const viewport = scroller ? scroller.clientHeight : window.innerHeight;
      if (root && root.scrollTop > 0 && root.scrollTop + viewport >= root.scrollHeight - 2 && ids.length) current = ids[ids.length - 1];
      if (current && current !== activeRef.current && current !== reported.current) {
        reported.current = current;
        setActiveId(current);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const source: HTMLElement | Window = scroller ?? window;
    update();
    source.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      source.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [track, offset, container, idsKey, activeRef, setActiveId]);

  const follow = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const heading = document.getElementById(id);
    if (!heading || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const reduce = isMotionReduced(heading);
    const behavior: ScrollBehavior = smooth && !reduce ? 'smooth' : 'auto';
    // Scroll only the article's own scroller (not every ancestor), leaving `offset` above the heading.
    const scroller = container?.current ?? null;
    const target: HTMLElement | Window = scroller ?? window;
    const delta = heading.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top : 0) - offset;
    const from = scroller ? scroller.scrollTop : window.scrollY;
    if (Math.abs(delta) > 1) {
      locked.current = true;
      const token = ++lockToken.current;
      const release = () => {
        target.removeEventListener('scrollend', release);
        // A later click owns the lock now.
        if (lockToken.current === token) locked.current = false;
      };
      target.addEventListener('scrollend', release);
      // Browsers without `scrollend`, and scrolls that end at the bottom before reaching the heading.
      clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(release, behavior === 'smooth' ? 1200 : 100);
      target.scrollTo({ top: from + delta, behavior });
    }
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    if (updateHash) history.replaceState(history.state, '', `#${encodeURIComponent(id)}`);
    reported.current = id;
    setActiveId(id);
  };

  const heading = createElement(`h${headingLevel}`, { id: titleId, className: 'ui-article-toc__title' }, copy.title);
  const list = (
    <ol className="ui-article-toc__list" role="list">
      {items.map((item) => (
        <li key={item.id} className="ui-article-toc__item" data-level={item.level ?? 1}>
          <a
            className="ui-article-toc__link"
            href={`#${item.id}`}
            aria-current={item.id === activeId ? 'location' : undefined}
            onClick={(event) => follow(event, item.id)}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav className={cx('ui-article-toc', className)} aria-labelledby={titleId} data-collapsible={collapsible || undefined} {...rest}>
      {collapsible ? (
        <details className="ui-article-toc__details">
          <summary className="ui-article-toc__summary">
            {heading}
            <ChevronDownIcon size={16} className="ui-article-toc__chevron" aria-hidden="true" />
          </summary>
          {list}
        </details>
      ) : (
        <>
          {heading}
          {list}
        </>
      )}
    </nav>
  );
});
