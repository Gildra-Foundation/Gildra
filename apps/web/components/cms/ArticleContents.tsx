"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasAnchorSpy } from "@gildra/atlas-ui/AtlasAnchorSpy";
import styles from "./cms.module.css";

type Entry = { id: string; text: string };

/** One contents list: a quiet desktop rail, an optional disclosure on small screens. */
export function ArticleContents({ title, items }: { title: string; items: Entry[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  return (
    <nav className={styles.toc} aria-label={title}>
      <p className={styles.tocDesktopTitle}>{title}</p>
      <AtlasButton
        variant="ghost"
        className={styles.tocToggle}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
        iconAfter={<ChevronDown aria-hidden="true" />}
      >
        {title}<span className={styles.tocCount} aria-hidden="true">{items.length}</span>
      </AtlasButton>
      <ol id={listId} className={styles.tocList} data-expanded={expanded}>
        {items.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}
      </ol>
      <AtlasAnchorSpy />
    </nav>
  );
}
