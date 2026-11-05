import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import styles from "./unlockCards.module.css";

export type UnlockCard = {
  title: string;
  text: string;
  /** Painted Frost Hall scene behind the card (public/assets/wow/characters/unlocks). */
  art: string;
  /** Only where the card honestly leads somewhere a guest can open. */
  href?: string;
};

/**
 * "What opens after sign-in": tall painted cards with a notched plate (number, arrow, title, text).
 * Hover and keyboard focus lift the plate and drift the painting; all motion is transform/opacity
 * and stops under reduced motion, "Less motion", reduced transparency and forced colours.
 */
export function UnlockCards({ cards }: { cards: UnlockCard[] }) {
  return (
    <ul className={styles.cards}>
      {cards.map((card, index) => {
        const number = String(index + 1).padStart(2, "0");
        const body = (
          <>
            <span className={styles.art} aria-hidden="true">
              <Image src={card.art} alt="" fill sizes="(max-width: 760px) 92vw, (max-width: 1180px) 46vw, 30vw" className={styles.artImage} />
            </span>
            <span className={styles.plate}>
              <span className={styles.shape} aria-hidden="true"><i /><i /><i /></span>
              <span className={styles.number} aria-hidden="true">{number}</span>
              {card.href ? <ArrowUpRight className={styles.arrow} aria-hidden="true" /> : null}
              <span className={styles.copy}>
                <h3 className={styles.title}>{card.title}</h3>
                <span className={styles.text}>{card.text}</span>
              </span>
            </span>
          </>
        );
        return (
          <li key={card.title}>
            {card.href
              ? <Link className={styles.card} href={card.href} prefetch={false} data-unlock-card>{body}</Link>
              : <article className={styles.card} data-unlock-card>{body}</article>}
          </li>
        );
      })}
    </ul>
  );
}
