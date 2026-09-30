import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TalentCalculatorWithLocalization } from "@/components/talents/TalentCalculatorWithLocalization";
import { TalentCalculatorSkeleton } from "@/components/TalentCalculatorSkeleton";
import { getMidnightTalentPageData } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme } from "@/lib/talentSpecThemes";
import { getTalentSpecStyles } from "@/lib/talentSpecStyles";

type PageProps = { params: Promise<{ spec: string }>; searchParams: Promise<{ hero?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  if (!theme) return {};
  return {
    title: `${theme.specName} ${theme.className} Talent Calculator — Gildra`,
    description: `Interactive Midnight talent calculator for ${theme.specName} ${theme.className}, sourced from a provenance-marked community snapshot.`,
    alternates: { canonical: `/talents/${theme.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function TalentSpecPage({ params, searchParams }: PageProps) {
  const { spec } = await params;
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  const specStyles = await getTalentSpecStyles(theme);
  return <>
    <style key={theme.slug} data-talent-spec-styles={theme.slug}>{specStyles}</style>
    <Suspense fallback={<TalentCalculatorSkeleton />}>
      <TalentCalculatorContent spec={spec} searchParams={searchParams} theme={theme} />
    </Suspense>
  </>;
}

async function TalentCalculatorContent({
  spec,
  searchParams,
  theme,
}: {
  spec: string;
  searchParams: PageProps["searchParams"];
  theme: NonNullable<ReturnType<typeof getTalentSpecTheme>>;
}) {
  try {
    const heroPathId = Number((await searchParams).hero) || undefined;
    const data = await getMidnightTalentPageData(spec, heroPathId, "en");
    return <TalentCalculatorWithLocalization key={`${theme.slug}-${data.heroSubtreeId}`} data={data} theme={theme} lang="en" />;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(`[talents/${spec}] data load failed`, error);
    return <TalentCalculatorWithLocalization key={theme.slug} data={null} theme={theme} lang="en" />;
  }
}
