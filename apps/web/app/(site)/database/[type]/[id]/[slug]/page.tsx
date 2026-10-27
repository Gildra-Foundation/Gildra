// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { redirectDatabaseRecord } from "@/components/database/databaseRedirect";

type Props = { params: Promise<{ type: string; id: string; slug: string }> };

export default async function Page({ params }: Props) {
  return redirectDatabaseRecord("en", params);
}
