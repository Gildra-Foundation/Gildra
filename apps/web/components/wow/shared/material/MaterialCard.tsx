import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MaterialLinkButton } from "./MaterialButton";
import { materialFrameArtwork, materialFrameStyle, materialPlaqueStyle, type AnyMaterialKit } from "./materialKit";
import styles from "./material.module.css";

type FrameProps = {
  kit: AnyMaterialKit;
  /** Scene painted inside the frame's window (decor: alt=""). */
  src: string;
  children?: never;
  /** object-position of the scene. */
  position?: string;
  sizes?: string;
  priority?: boolean;
};

/** Live content in the frame's window (a 3D slot, a map): the page keeps its own accessibility. */
type LiveFrameProps = { kit: AnyMaterialKit; children: ReactNode; sizes?: string; src?: never; position?: never; priority?: never };

/** A scene — or live content — inside the kit's painted frame, clipped to the frame's measured window (design.md §4.3). */
export function MaterialFrame(props: FrameProps | LiveFrameProps) {
  const { kit, sizes = "(max-width: 900px) 100vw, 50vw" } = props;
  const live = props.children !== undefined;
  return <div className={styles.frame} style={materialFrameStyle(kit)} aria-hidden={live ? undefined : true} data-live={live || undefined}>
    <div className={styles.frameWindow}>
      {live ? props.children : <Image src={props.src!} alt="" fill sizes={sizes} priority={props.priority ?? false} className={styles.frameScene} style={props.position ? { objectPosition: props.position } : undefined} />}
    </div>
    <Image src={materialFrameArtwork(kit)} alt="" fill sizes={sizes} className={styles.frameArt} aria-hidden="true" />
  </div>;
}

type CardProps = FrameProps & {
  href: string;
  title: string;
  /** One or two sentences: what the player finds there. */
  text: string;
  /** Label of the painted button; the screen reader hears it with the title. */
  action: string;
  /** A short line above the title (location, count). */
  eyebrow?: ReactNode;
  headingLevel?: 2 | 3;
};

/**
 * "Picture + plaque" card of a destination (design.md §3.2): the framed scene is a
 * decorative link, the heading is the one real link, the painted button repeats it
 * for the hand (its label is announced with the title).
 */
export function MaterialCard({ kit, href, title, text, action, eyebrow, headingLevel = 3, ...frame }: CardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <article className={styles.card} style={materialPlaqueStyle(kit)}>
    <Link className={styles.cardArt} href={href} prefetch={false} tabIndex={-1} aria-hidden="true">
      <MaterialFrame kit={kit} {...frame} />
    </Link>
    <div className={`${styles.plaque} ${styles.cardBody}`}>
      {eyebrow ? <p className={styles.cardEyebrow}>{eyebrow}</p> : null}
      <Heading className={styles.cardTitle}><Link href={href} prefetch={false}>{title}</Link></Heading>
      <p className={styles.plaqueText}>{text}</p>
      <MaterialLinkButton kit={kit} fit="block" href={href} prefetch={false} iconAfter={<ArrowRight aria-hidden="true" />}>
        {action}<span className={styles.srOnly}>: {title}</span>
      </MaterialLinkButton>
    </div>
  </article>;
}
