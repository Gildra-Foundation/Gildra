import { ViewTransition, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { artMorphName } from "@/lib/atlas/morph";
import { AtlasMorphPreload } from "./AtlasMorphPreload";
import styles from "./AtlasPath.module.css";

export type AtlasPathStep = {
  href: string;
  title: ReactNode;
  /** Artwork of the step (boss portrait, area). */
  image: { src: string; alt?: string; position?: string };
  description?: ReactNode;
  /** Short facts under the description ("7 mechanics"). */
  meta?: { icon?: ReactNode; label: ReactNode }[];
  /** Accessible name of the arrow ("Open guide"). */
  cta?: ReactNode;
};

/**
 * An ordered journey through illustrated steps — the encounters of a raid in
 * the order you meet them. Numbered seals sit on one spine; the artwork swaps
 * sides from step to step, and each step slides in from its side on scroll.
 */
const stepPicture = (step: AtlasPathStep) => (
  <Image src={step.image.src} alt={step.image.alt ?? ""} fill sizes="(max-width: 720px) 100vw, 380px" style={step.image.position ? { objectPosition: step.image.position } : undefined} />
);

export function AtlasPath({ steps, label, headingLevel = 3, morph = false, className }: { steps: AtlasPathStep[]; label?: string; headingLevel?: 2 | 3; /** Step pictures morph into the opened page's scene (AtlasFrame morphKey). */ morph?: boolean; className?: string }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ol className={clsx(styles.path, className)} aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.href} className={styles.step}>
          <span className={styles.seal} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <Link href={step.href} className={styles.card} data-spotlight>
            <div className={styles.art}>
              {morph ? <ViewTransition name={artMorphName(step.href)} share="atlas-art-morph">{stepPicture(step)}</ViewTransition> : stepPicture(step)}
              {morph ? <AtlasMorphPreload art={step.image.src} /> : null}
            </div>
            <div className={styles.body}>
              <Heading className={styles.title}>{step.title}</Heading>
              {step.description ? <span className={styles.description}>{step.description}</span> : null}
              <div className={styles.footer}>
                {step.meta?.length ? <span className={styles.meta}>{step.meta.map((item, metaIndex) => <span key={metaIndex}>{item.icon}{item.label}</span>)}</span> : <span />}
                <span className={styles.cta}>{step.cta ? <span className={styles.srOnly}>{step.cta}</span> : null}<ArrowRight aria-hidden="true" /></span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
