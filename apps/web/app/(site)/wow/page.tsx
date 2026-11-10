// routes:mirror — app/ru twin is generated from this page (npm run routes:mirror).
import { WowHome } from "@/components/wow/home/WowHome";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { changelog } from "@/components/wow/whats-new/changelog";
import { homeMetadata } from "@/components/wow/home/homeMetadata";

export const metadata = homeMetadata("en");

export default function Page() {
  return <WowHome lang="en" raids={raidHubEntries} news={changelog.flatMap(release => release.changes.filter(change => change.kind === "new").map(change => ({ ...change, date: release.date }))).slice(0, 4)} />;
}
