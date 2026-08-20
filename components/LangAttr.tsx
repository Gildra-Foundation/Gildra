"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { langOf } from "@/lib/i18n";

/** Корневой layout один на оба языка — html lang переключаем на клиенте. */
export function LangAttr() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = langOf(pathname);
  }, [pathname]);
  return null;
}
