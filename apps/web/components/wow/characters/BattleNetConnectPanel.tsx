import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import styles from "./battleNetConnectPanel.module.css";

/** The one Battle.net sign-in card of the account pages (login, roster, roster errors). */
export function BattleNetConnectPanel({ eyebrow, title, description, children, note, headingLevel = 2, className, eyebrowIcon }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  note?: ReactNode;
  headingLevel?: 2 | 3;
  className?: string;
  eyebrowIcon?: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={`${styles.panel} ${className ?? ""}`}>
      <p className={styles.eyebrow} data-battlenet-eyebrow>{eyebrowIcon ?? <ShieldCheck aria-hidden="true" />}{eyebrow}</p>
      <Heading id="battlenet-connect-title" className={styles.title}>{title}</Heading>
      <p className={styles.text}>{description}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
      {note ? <p className={styles.note} data-battlenet-note>{note}</p> : null}
    </div>
  );
}
