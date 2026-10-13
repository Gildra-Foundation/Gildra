"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n";
import { lessMotion } from "@/lib/client/motionPreference";
import { PhoneBook } from "../home/PhoneBook";
import type { BookPhase, CoverPose } from "../home/HomeBook";
import leafStyles from "../home/homeBook.module.css";
import { BookVolume } from "./BookVolume";
import { animateBookCover } from "./bookCoverMotion";
import styles from "./bookNavigation.module.css";

const phoneQuery = "(max-width: 820px)";
const subscribePhone = (notify: () => void) => {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isPhone = () => window.matchMedia(phoneQuery).matches;

function containBookFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab" || !(event.target instanceof HTMLElement)) return;
  const dialog = event.target.closest("dialog");
  if (!dialog) return;
  const targets = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"))
    .filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}

type Props = { open: boolean; onClose: () => void; lang: Lang; coverFrom: () => DOMRect | null };

/** The toolbar uses the same cover swing as the home book, starting at its icon. */
export function BookNavigationDialog({ open, ...props }: Props) {
  return open ? <ToolbarBookSession {...props} /> : null;
}

function ToolbarBookSession({ onClose, lang, coverFrom }: Omit<Props, "open">) {
  const [phase, setPhase] = useState<BookPhase>("opening");
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const callbacks = useRef({ onClose, coverFrom });
  useLayoutEffect(() => { callbacks.current = { onClose, coverFrom }; }, [onClose, coverFrom]);
  const dismiss = useCallback(() => callbacks.current.onClose(), []);
  const coverPose = useCallback((): CoverPose | null => {
    const rect = callbacks.current.coverFrom();
    if (!rect) return null;
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, visual: new DOMMatrix() };
  }, []);
  const onPhase = useCallback<Dispatch<SetStateAction<BookPhase>>>((next) => setPhase(next), []);

  useEffect(() => {
    if (phase === "closed") dismiss();
  }, [phase, dismiss]);
  useEffect(() => {
    if (pathname !== previousPath.current) dismiss();
    previousPath.current = pathname;
  }, [pathname, dismiss]);
  // Native modal focus is returned to the Contents button, including on phones.
  useLayoutEffect(() => {
    const previousFocus = document.activeElement;
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  if (phase === "closed") return null;

  const coverFace = <img className={styles.toolbarCoverImage} src="/assets/wow/character-book/intro/chronicle-cover-v2-640.webp"
    width={1024} height={1536} alt="" draggable={false} />;

  return <div className={styles.toolbarScope} data-motion={lessMotion() ? "reduced" : undefined} onKeyDown={containBookFocus}>
    {phone ? <PhoneBook lang={lang} phase={phase} onPhase={onPhase} coverPose={coverPose} coverFace={coverFace}
      onNavigate={dismiss} onDismiss={dismiss} reducedMotion={lessMotion} />
      : <DesktopToolbarBook lang={lang} phase={phase} onPhase={onPhase} coverPose={coverPose} coverFace={coverFace} onDismiss={dismiss} />}
  </div>;
}

function DesktopToolbarBook({ lang, phase, onPhase, coverPose, coverFace, onDismiss }: {
  lang: Lang; phase: BookPhase; onPhase: Dispatch<SetStateAction<BookPhase>>;
  coverPose: () => CoverPose | null; coverFace: ReactNode; onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const tearingDown = useRef(false);
  const titleId = useId();
  const moving = phase === "opening" || phase === "closing";
  const close = () => {
    if (phase === "opening") onDismiss();
    else if (phase === "open") onPhase("closing");
  };

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    tearingDown.current = false;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      tearingDown.current = true;
      document.body.style.overflow = previousOverflow;
      element.close();
    };
  }, []);

  useLayoutEffect(() => {
    if (!moving) return;
    const bookElement = book.current;
    const leafElement = leaf.current;
    const actionsElement = actions.current;
    const pose = coverPose();
    const finish = () => onPhase(phase === "opening" ? "open" : "closed");
    if (!bookElement || !leafElement || !actionsElement || !pose) { finish(); return; }
    const height = bookElement.getBoundingClientRect().height;
    bookElement.style.setProperty("--leaf-width", `${pose.width}px`);
    bookElement.style.setProperty("--leaf-height", `${pose.height}px`);
    bookElement.style.setProperty("--leaf-scale", `${height / pose.height}`);
    return animateBookCover({ book: bookElement, leaf: leafElement, actions: actionsElement, pose,
      opening: phase === "opening", onFinish: finish, reducedMotion: lessMotion() });
  }, [phase, moving, onPhase, coverPose]);

  useEffect(() => {
    if (phase === "open") book.current?.focus({ preventScroll: true });
  }, [phase]);

  return <dialog ref={dialog} className={styles.toolbarDialog} aria-labelledby={titleId} data-phase={phase}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={(event) => { if (!tearingDown.current && !event.currentTarget.open) onDismiss(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={book} className={styles.toolbarBook} tabIndex={-1}>
      <div inert={moving}><BookVolume lang={lang} active titleId={titleId} onNavigate={onDismiss} /></div>
      <div className={leafStyles.leafMotion} hidden={!moving}>
        <div ref={leaf} className={leafStyles.leaf} aria-hidden="true">
          <div className={leafStyles.front}><div className={leafStyles.cover}>{coverFace}</div><span className={leafStyles.shade} data-shade /></div>
          <div className={leafStyles.back}><span className={leafStyles.shade} data-shade /></div>
        </div>
      </div>
      <div ref={actions} className={styles.toolbarActions}>
        <button className={styles.toolbarClose} type="button" onClick={close} aria-label={lang === "ru" ? "Закрыть книгу" : "Close the book"}><span aria-hidden="true">×</span></button>
      </div>
    </div>
  </dialog>;
}
