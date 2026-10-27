// Generated from app/(site)/database/[type]/[id]/[slug]/page.tsx by npm run routes:mirror — edit the English page.
import { redirectDatabaseRecord } from "@/components/database/databaseRedirect";

type Props = { params: Promise<{ type: string; id: string; slug: string }> };

export default async function Page({ params }: Props) {
  return redirectDatabaseRecord("ru", params);
}
