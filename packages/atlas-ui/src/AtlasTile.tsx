import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import clsx from "clsx";
import styles from "./AtlasTile.module.css";

/** Compact link with an icon: quick access, next steps, related tools. */
export function AtlasTile({ href, icon, title, text, index, className }: { href: string; icon?: ReactNode; title: ReactNode; text?: ReactNode; index?: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx(styles.tile, className)} data-spotlight>
      {index !== undefined ? <span className={styles.index}>{index}</span> : null}
      {icon ? <span className={styles.icon} aria-hidden="true">{icon}</span> : null}
      <span className={styles.copy}>
        <strong>{title}</strong>
        {text ? <small>{text}</small> : null}
      </span>
      <ChevronRight className={styles.chevron} aria-hidden="true" />
    </Link>
  );
}
