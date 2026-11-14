import { WowHome } from "@/components/wow/home/WowHome";
import { raidHubEntries } from "@/components/wow/raid/raidHubData";
import { changelog } from "@/components/wow/whats-new/changelog";
import { homeMetadata } from "@/components/wow/home/homeMetadata";

// Served from the cache and rendered again at most once a minute: the weekly meta card reads the API.
export const dynamic = "force-static";
export const revalidate = 60;
export const metadata = homeMetadata("en");

export default function HomePage() {
  return <WowHome lang="en" raids={raidHubEntries} news={changelog.flatMap(release => release.changes.filter(change => change.kind === "new").map(change => ({ ...change, date: release.date }))).slice(0, 4)} />;
}
