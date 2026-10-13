import type { ReactNode } from "react";
import styles from "./characterAtlasProfile.module.css";

export function CharacterBookChapter({ id, eyebrow, title, description, icon }: {
  id: string; index: string; eyebrow: string; title: string; description: string; icon: ReactNode;
}) {
  return <header className={styles.chapter} id={id}>
    <span aria-hidden="true">{icon}</span>
    <div><small>{eyebrow}</small><h2>{title}</h2><p>{description}</p></div>
  </header>;
}
