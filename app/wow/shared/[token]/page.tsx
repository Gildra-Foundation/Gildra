import { SharedCharacterRunPage } from "@/components/wow/audit/SharedCharacterRunPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <SharedCharacterRunPage token={(await params).token} localePrefix="" />;
}
