"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { scheduleTouchIdlePrefetch } from "@/components/platform/navigation/touchIdlePrefetch";

const BookNavigationDialog = dynamic(
  () => import("@/components/platform/navigation/BookNavigationDialog").then((module) => module.BookNavigationDialog),
  { ssr: false },
);

function warmBookNavigation() {
  void import("@/components/platform/navigation/BookNavigationDialog");
}

export function BookOpener({
  className,
  lang,
  ariaLabel,
  children,
}: {
  className: string;
  lang: Lang;
  ariaLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => scheduleTouchIdlePrefetch(warmBookNavigation), []);

  return <>
    <button
      className={className}
      type="button"
      onPointerEnter={warmBookNavigation}
      onFocus={warmBookNavigation}
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-label={ariaLabel}
    >
      {children}
    </button>
    {open ? <BookNavigationDialog open onClose={() => setOpen(false)} lang={lang} /> : null}
  </>;
}
