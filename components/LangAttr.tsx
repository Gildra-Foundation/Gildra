"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Корневой layout один на оба языка — html lang переключаем на клиенте. */
export function LangAttr() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = pathname === "/ru" || pathname?.startsWith("/ru/") ? "ru" : "en";
  }, [pathname]);
  return null;
}
