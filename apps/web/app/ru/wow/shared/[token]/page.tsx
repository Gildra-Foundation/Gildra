import type { Metadata } from "next";
import { SharedCharacterRunPage } from "@/components/wow/audit/SharedCharacterRunPage";

export const dynamic = "force-dynamic";
// A visitor's own character or a shared link: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <SharedCharacterRunPage token={(await params).token} localePrefix="/ru" />;
}
