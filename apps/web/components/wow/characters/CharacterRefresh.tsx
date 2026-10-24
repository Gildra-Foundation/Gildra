"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtlasButton } from "@/components/atlas";

export function CharacterRefresh({ lang }: { lang: "ru" | "en" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <AtlasButton disabled={pending} aria-busy={pending} onClick={() => start(() => router.refresh())}>
    {pending ? lang === "ru" ? "Обновление…" : "Refreshing…" : lang === "ru" ? "Обновить профиль" : "Refresh profile"}
  </AtlasButton>;
}
