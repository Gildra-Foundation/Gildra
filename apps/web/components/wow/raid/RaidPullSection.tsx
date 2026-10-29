import { AtlasSection } from "@/components/atlas";
import { getRaidPullPlan } from "./raidPullPlans.server";
import { raidPullCopy } from "./raidPullCopy";
import { RaidPullWorkspace } from "./RaidPullWorkspace";

export function RaidPullSection({ slug, locale }: { slug: string; locale: "ru" | "en" }) {
  const plan = getRaidPullPlan(slug);
  if (!plan?.pulls.length) return null;
  const t = raidPullCopy[locale];
  return <AtlasSection id="pulls" title={slug === "the-voidspire" ? t.overviewTitle : t.title} description={slug === "the-voidspire" ? undefined : t.description}><RaidPullWorkspace plan={plan} locale={locale} /></AtlasSection>;
}
