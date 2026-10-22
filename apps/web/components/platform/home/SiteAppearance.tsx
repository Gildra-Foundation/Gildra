"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSiteTheme } from "@/components/motion/SiteTheme";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { homeThemes, isHomeTheme } from "./homeThemes";
import styles from "./atlasHome.module.css";

export function SiteAppearance({ locale, label }: { locale: "en" | "ru"; label: string }) {
  const id = useId();
  const { theme, selectTheme } = useSiteTheme();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div className={styles.appearance}>
    <label htmlFor={id}>{label}</label>
    <AtlasValyroSelect id={id} aria-label={label} value={theme} aria-busy={pending || undefined}
      options={homeThemes.map((item) => ({ value: item.id, label: item[locale] }))}
      onValueChange={(next) => {
      if (!isHomeTheme(next)) return;
      selectTheme(next);
      // Refresh the server-rendered character art from the same preference cookie.
      startTransition(() => router.refresh());
    }} />
  </div>;
}
