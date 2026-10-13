import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import styles from "./battleNetConnectPanel.module.css";

/** The one Battle.net sign-in card of the account pages (login, roster, roster errors). */
export function BattleNetConnectPanel({ eyebrow, title, description, children, note, headingLevel = 2 }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  note?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={styles.panel}>
      <p className={styles.eyebrow}><ShieldCheck aria-hidden="true" />{eyebrow}</p>
      <Heading id="battlenet-connect-title" className={styles.title}>{title}</Heading>
      <p className={styles.text}>{description}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
    </div>
  );
}
