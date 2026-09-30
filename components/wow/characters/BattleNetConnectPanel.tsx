import type { ReactNode } from "react";
import { Shield } from "lucide-react";
import styles from "./battleNetConnectPanel.module.css";

export function BattleNetConnectPanel({ eyebrow, title, description, children, note }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-labelledby="battlenet-connect-title">
      <span className={styles.seal} aria-hidden="true"><Shield /></span>
      <div className={styles.copy}>
        <small>{eyebrow}</small>
        <h2 id="battlenet-connect-title">{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.actions}>{children}</div>
      {note ? <div className={styles.note}>{note}</div> : null}
    </section>
  );
}
