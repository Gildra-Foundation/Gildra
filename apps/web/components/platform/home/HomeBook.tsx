"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { Lang } from "@/lib/i18n";
import { scheduleTouchIdlePrefetch } from "@/components/platform/navigation/touchIdlePrefetch";
import { bookArtworkSrc, phoneBookArtworkSrc } from "@/components/platform/navigation/bookArtwork";

/** closed → opening → open ⇄ held (the full-page book) → closing → closed */
export type BookPhase = "closed" | "opening" | "open" | "held" | "closing";
/** Where the closed cover is drawn right now, including its tilt. */
export type CoverPose = { x: number; y: number; width: number; height: number; visual: DOMMatrix };
export type OpenBookProps = {
  lang: Lang;
  phase: BookPhase;
  onPhase: Dispatch<SetStateAction<BookPhase>>;
  coverPose: () => CoverPose | null;
  coverFace: ReactNode;
};
type StoredPose = { left: number; top: number; width: number; height: number; transform: string; originX: number; originY: number };

const phoneQuery = "(max-width: 820px)";
const isPhone = () => window.matchMedia(phoneQuery).matches;
// Wide screens open the book in the hero; phones open it as a full-screen modal.
const loadBook = (): Promise<ComponentType<OpenBookProps>> => isPhone()
  ? import("./PhoneBook").then((module) => module.PhoneBook)
  : import("./OpenBook").then((module) => module.OpenBook);
const artworkReady = new Map<string, Promise<void>>();

/** Loads the book and decodes its folio ahead, so the swing never waits on the image. */
function warmBook() {
  void loadBook();
  const src = isPhone() ? phoneBookArtworkSrc : bookArtworkSrc;
  let ready = artworkReady.get(src);
  if (!ready) {
    const artwork = new Image();
    artwork.src = src;
    ready = artwork.decode().catch(() => undefined);
    artworkReady.set(src, ready);
  }
  return ready;
}

const HomeBookContext = createContext<{ phase: BookPhase; cover: RefObject<HTMLButtonElement | null>; open: () => void } | null>(null);

/** The home hero: the closed cover opens in place, and can then be lifted to a full-page book. */
export function HomeBookStage({ lang, className, coverFace, children }: { lang: Lang; className: string; coverFace: ReactNode; children: ReactNode }) {
  const hero = useRef<HTMLElement>(null);
  const cover = useRef<HTMLButtonElement>(null);
  const stored = useRef<StoredPose | null>(null);
  const loading = useRef(false);
  const wasOpen = useRef(false);
  const [phase, setPhase] = useState<BookPhase>("closed");
  const [OpenBook, setOpenBook] = useState<ComponentType<OpenBookProps> | null>(null);

  useEffect(() => scheduleTouchIdlePrefetch(() => void loadBook()), []);
  useEffect(() => {
    if (phase !== "closed") { wasOpen.current = true; return; }
    if (wasOpen.current) cover.current?.focus({ preventScroll: true });
    wasOpen.current = false;
  }, [phase]);

  // The cover keeps its layout box while the book is open on wide screens; on
  // narrow ones it leaves the flow, so its last measured place is kept relative to the hero.
  const coverPose = useCallback((): CoverPose | null => {
    const heroElement = hero.current;
    const button = cover.current;
    if (!heroElement || !button) return null;
    const heroRect = heroElement.getBoundingClientRect();
    const parent = button.offsetParent;
    if (parent instanceof HTMLElement) {
      const parentRect = parent.getBoundingClientRect();
      const style = getComputedStyle(button);
      const [originX = 0, originY = 0] = style.transformOrigin.split(" ").map(Number.parseFloat);
      stored.current = {
        left: parentRect.left + parent.clientLeft + button.offsetLeft - heroRect.left,
        top: parentRect.top + parent.clientTop + button.offsetTop - heroRect.top,
        width: button.offsetWidth,
        height: button.offsetHeight,
        transform: style.transform,
        originX,
        originY,
      };
    }
    const pose = stored.current;
    if (!pose) return null;
    const x = heroRect.left + pose.left;
    const y = heroRect.top + pose.top;
    const originX = x + pose.originX;
    const originY = y + pose.originY;
    const tilt = new DOMMatrix(pose.transform === "none" ? undefined : pose.transform);
    return { x, y, width: pose.width, height: pose.height, visual: new DOMMatrix().translate(originX, originY).multiply(tilt).translate(-originX, -originY) };
  }, []);

  const open = useCallback(() => {
    if (phase !== "closed" || loading.current) return;
    loading.current = true;
    const artwork = warmBook();
    coverPose();
    // Wait briefly for a cold artwork decode; never hold the tap for long.
    const decoded = Promise.race([artwork, new Promise<void>((resolve) => window.setTimeout(resolve, 400))]);
    void Promise.all([loadBook(), decoded]).then(([Book]) => {
      setOpenBook(() => Book);
      setPhase("opening");
    }).finally(() => { loading.current = false; });
  }, [phase, coverPose]);

  return <HomeBookContext.Provider value={{ phase, cover, open }}>
    <main ref={hero} className={className} data-book-state={phase}>
      {children}
      {OpenBook && phase !== "closed" ? <OpenBook lang={lang} phase={phase} onPhase={setPhase} coverPose={coverPose} coverFace={coverFace} /> : null}
    </main>
  </HomeBookContext.Provider>;
}

export function HomeBookCover({ className, ariaLabel, children }: { className: string; ariaLabel: string; children: ReactNode }) {
  const book = useContext(HomeBookContext);
  if (!book) throw new Error("The book cover must be inside HomeBookStage");
  return <button ref={book.cover} className={className} type="button" aria-label={ariaLabel} aria-expanded={book.phase !== "closed"}
    onPointerEnter={() => void warmBook()} onPointerDown={() => void warmBook()} onFocus={() => void warmBook()} onClick={book.open}>
    {children}
  </button>;
}
