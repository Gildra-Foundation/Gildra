"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import type { TalentChoice, TalentNode } from "@/lib/talentCalculatorData";
import tooltipStyles from "@/components/wow/audit/warcraftTooltip.module.css";
import { TalentDescription } from "./TalentDescription";
import type { TalentCalculatorCopy, TalentCopyLang } from "./talentCalculatorCopy";
import { placeTooltip } from "@/lib/talentTooltipPlacement";
import styles from "./talentTree.module.css";

const UNVERIFIED_ICON = "/assets/wow/icon-unverified.svg";
const Icon = ({ choice }: { choice?: TalentChoice }) => <img src={choice?.iconUrl || UNVERIFIED_ICON} alt="" width={40} height={40} loading="lazy" decoding="async" />;

export type TalentCardModel = { node: TalentNode; rank: number; selectedChoice?: number; lockReason: string };

function kindLabel(choice: TalentChoice | undefined, copy: TalentCalculatorCopy) {
  return choice?.talentType === "active" ? copy.activeAbility : copy.passiveEffect;
}

/** Everything a player needs about one node: name, rank, what it does, the other option, and what it waits for. */
export function TalentCardBody({ model, copy, lang }: { model: TalentCardModel; copy: TalentCalculatorCopy; lang: TalentCopyLang }) {
  const { node, rank, selectedChoice, lockReason } = model;
  const rankText = copy.rankOf(rank, node.maxRanks);
  let body: ReactNode;
  if (node.nodeType === "tiered") {
    const starts = node.choices.reduce<number[]>((list, choice, index) => [...list, index ? list[index - 1] + node.choices[index - 1].maxRanks : 1], []);
    body = <>
      <div className={styles.cardHead}><Icon choice={node.choices[0]} /><div><b>{node.choices[0]?.name ?? copy.apex}</b><span>{copy.apex} · {rankText}</span></div></div>
      {node.choices.map((choice, index) => {
        const start = starts[index];
        return <div className={styles.tier} key={choice.externalId}><small>{copy.rankRange(`${start}${choice.maxRanks > 1 ? `–${start + choice.maxRanks - 1}` : ""}`)}</small><TalentDescription talent={choice} locale={lang} /></div>;
      })}
    </>;
  } else if (node.nodeType === "choice" && node.choices.length > 1 && !rank) {
    body = node.choices.map((choice, index) => <div className={index ? styles.option : styles.card} key={choice.externalId}>
      <div className={styles.cardHead}><Icon choice={choice} /><div><b>{choice.name}</b><span>{kindLabel(choice, copy)}{index === 0 ? ` · ${rankText}` : ""}</span></div></div>
      <TalentDescription talent={choice} locale={lang} />
    </div>);
  } else {
    const choice = node.choices.find((entry) => entry.externalId === selectedChoice) ?? node.choices[0];
    const others = node.choices.filter((entry) => entry !== choice);
    body = <>
      <div className={styles.cardHead}><Icon choice={choice} /><div><b>{choice?.name ?? copy.apex}</b><span>{kindLabel(choice, copy)} · {rankText}</span></div></div>
      {choice ? <TalentDescription talent={choice} locale={lang} /> : null}
      {others.length ? <p className={styles.alt}>{copy.orChoice(others.map((entry) => entry.name).join(", "))}</p> : null}
    </>;
  }
  return <div className={styles.card}>
    {body}
    {lockReason ? <p className={styles.lock}>{lockReason}</p> : null}
  </div>;
}

export type TalentTipHandle = { show: (nodeId: string, anchor: HTMLElement) => void; hide: () => void };

/** The one tooltip of all trees (portal on <body>, the site tooltip surface). Hover/focus only move it. */
export function TalentTip({ ref, render }: { ref: Ref<TalentTipHandle>; render: (nodeId: string) => ReactNode }) {
  const [tip, setTip] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    show: (id, anchor) => setTip((current) => current?.id === id && current.anchor === anchor ? current : { id, anchor }),
    hide: () => setTip(null),
  }), []);
  useLayoutEffect(() => {
    const element = box.current;
    if (!tip || !element) return;
    const place = () => {
      if (!tip.anchor.isConnected) { element.style.visibility = "hidden"; return; }
      const spot = placeTooltip(tip.anchor.getBoundingClientRect(), element.offsetWidth, element.offsetHeight, { width: document.documentElement.clientWidth, height: window.innerHeight });
      element.style.translate = `${Math.round(spot.x)}px ${Math.round(spot.y)}px`;
      element.style.visibility = "visible";
    };
    place();
    // A description that arrives later changes the height: place it again.
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  });
  const open = Boolean(tip);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    // The tooltip follows its node while the page scrolls (also the scroll a keyboard focus causes).
    const follow = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; setTip((current) => current ? { ...current } : current); }); };
    const close = () => setTip(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", close); window.removeEventListener("keydown", onKey); };
  }, [open]);
  if (!tip || typeof document === "undefined") return null;
  const content = render(tip.id);
  return content ? createPortal(<div ref={box} role="tooltip" id="talent-tip" className={`${tooltipStyles.tooltip} ${styles.tip}`} data-talent-tip="" style={{ visibility: "hidden" }}>{content}</div>, document.body) : null;
}

type SheetProps = {
  model: TalentCardModel;
  copy: TalentCalculatorCopy;
  lang: TalentCopyLang;
  canAdd: boolean;
  onStep: (direction: 1 | -1) => void;
  onPick: (choiceId: number) => void;
  onClose: () => void;
};

/** The talent under the finger on touch screens: the card plus −/+ and the choice, docked at the bottom. */
export function TalentSheet({ model, copy, lang, canAdd, onStep, onPick, onClose }: SheetProps) {
  const { node, rank, selectedChoice } = model;
  const choice = node.nodeType === "choice" && node.choices.length > 1;
  return <section className={styles.sheet} aria-label={node.choices.map((entry) => entry.name).join(copy.or)} data-talent-sheet="">
    <div className={styles.sheetHead}>
      <TalentCardBody model={model} copy={copy} lang={lang} />
      <button type="button" className={styles.close} onClick={onClose} aria-label={copy.close}><X aria-hidden="true" /></button>
    </div>
    {choice ? <div className={styles.picks} role="group" aria-label={copy.choiceKeys}>
      {node.choices.map((entry) => <button key={entry.externalId} type="button" className={styles.pick} aria-pressed={rank > 0 && selectedChoice === entry.externalId} disabled={!rank && !canAdd} onClick={() => onPick(entry.externalId)}>
        <img src={entry.iconUrl || UNVERIFIED_ICON} alt="" width={32} height={32} /><span>{entry.name}</span>
      </button>)}
    </div> : null}
    {!node.freeNode && (!choice || rank > 0) ? <div className={styles.steps}>
      <button type="button" onClick={() => onStep(-1)} disabled={!rank} aria-label={copy.removeRank}><Minus aria-hidden="true" /></button>
      <output aria-live="polite">{rank}/{node.maxRanks}</output>
      <button type="button" onClick={() => onStep(1)} disabled={!canAdd || rank >= node.maxRanks} aria-label={copy.addRank}><Plus aria-hidden="true" /></button>
    </div> : null}
  </section>;
}
