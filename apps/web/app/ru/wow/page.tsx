// Generated from app/(site)/wow/page.tsx by npm run routes:mirror — edit the English page.
import { WowHome } from "@/components/wow/home/WowHome";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { changelog } from "@/components/wow/whats-new/changelog";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("wow", "ru");

export default function Page() {
  return <WowHome lang="ru" raids={raidHubEntries} news={changelog.filter(release => release.changes.some(change => change.kind === "new")).slice(0, 2)} />;
}
