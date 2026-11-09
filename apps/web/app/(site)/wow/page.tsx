// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { WowHome } from "@/components/wow/home/WowHome";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { changelog } from "@/components/wow/whats-new/changelog";
import { sectionMetadata } from "@/lib/routes/metadata";

export const metadata = sectionMetadata("wow", "en");

export default function Page() {
  return <WowHome lang="en" raids={raidHubEntries} news={changelog.filter(release => release.changes.some(change => change.kind === "new")).slice(0, 2)} />;
}
