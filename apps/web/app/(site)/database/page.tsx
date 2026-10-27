// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { redirectDatabaseHub, type DatabaseSearchParams } from "@/components/database/databaseRedirect";

export default async function DatabasePage({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return redirectDatabaseHub("en", searchParams);
}
