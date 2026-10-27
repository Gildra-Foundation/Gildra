// Generated from app/(site)/database/page.tsx by npm run routes:mirror — edit the English page.
import { redirectDatabaseHub, type DatabaseSearchParams } from "@/components/database/databaseRedirect";

export default async function DatabasePage({ searchParams }: { searchParams: Promise<DatabaseSearchParams> }) {
  return redirectDatabaseHub("ru", searchParams);
}
