import { PageShell } from "@/components/layout/PageShell";
import type { Metadata } from "next";
import { DatabaseHub, type DatabaseSearchParams } from "@/components/database/DatabaseHub";

export const metadata: Metadata = {
  title: "World of Warcraft Database — Gildra",
  description:
    "Browse Gildra's structured World of Warcraft catalog: items, spells, quests, creatures, maps and game systems.",
  alternates: { canonical: "/database", languages: { en: "/database", ru: "/ru/database", "x-default": "/database" } },
};

export default function DatabasePage({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return (
    <PageShell lang="en">
      <DatabaseHub lang="en" searchParams={searchParams} />
    </PageShell>
  );
}
