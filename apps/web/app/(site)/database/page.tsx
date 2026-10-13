// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { PageShell } from "@/components/layout/PageShell";
import { DatabaseHub, type DatabaseSearchParams } from "@/components/database/DatabaseHub";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("database", "en");

export default function DatabasePage({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return (
    <PageShell lang="en">
      <DatabaseHub lang="en" searchParams={searchParams} />
    </PageShell>
  );
}
