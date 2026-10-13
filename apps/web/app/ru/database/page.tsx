// Generated from app/(site)/database/page.tsx by npm run routes:mirror — edit the English page.
import { PageShell } from "@/components/layout/PageShell";
import { DatabaseHub, type DatabaseSearchParams } from "@/components/database/DatabaseHub";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("database", "ru");

export default function DatabasePage({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return (
    <PageShell lang="ru">
      <DatabaseHub lang="ru" searchParams={searchParams} />
    </PageShell>
  );
}
