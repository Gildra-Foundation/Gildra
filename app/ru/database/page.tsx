import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { DatabaseHub, type DatabaseSearchParams } from "@/components/database/DatabaseHub";

export const metadata: Metadata = {
  title: "База данных World of Warcraft — Gildra",
  description:
    "Структурированный каталог World of Warcraft: предметы, заклинания, задания, существа, карты и игровые системы.",
  alternates: { canonical: "/ru/database", languages: { en: "/database", ru: "/ru/database", "x-default": "/database" } },
};

export default function DatabasePageRu({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return (
    <PageShell lang="ru">
      <DatabaseHub lang="ru" searchParams={searchParams} />
    </PageShell>
  );
}
