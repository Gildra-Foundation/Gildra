import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TalentCalculatorWithLocalization } from "@/components/talents/TalentCalculatorWithLocalization";
import { TalentCalculatorSkeleton } from "@/components/TalentCalculatorSkeleton";
import { loadTalentPage } from "@/lib/talentPageLoad";
import { getTalentSpecTheme, talentSpecThemes } from "@/lib/talentSpecThemes";
import { pairedAlternates } from "@/lib/seo/metadata";
import { getTalentSpecStyles } from "@/lib/talentSpecStyles";

// Only the known specs exist: any other slug is a 404 before the loading screen streams.
export const dynamicParams = false;
export const generateStaticParams = () => talentSpecThemes.map(({ slug }) => ({ spec: slug }));

type PageProps = { params: Promise<{ spec: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  if (!theme) return {};
  return {
    title: `${theme.specName} ${theme.className} Talent Calculator — WowArcana`,
    description: `${theme.specName} ${theme.className} talent calculator for Midnight: class, hero and specialization trees with in-game string import and export.`,
    alternates: pairedAlternates("en", `/talents/${theme.slug}`),
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
    <Suspense fallback={<TalentCalculatorSkeleton lang="en" theme={theme} />}>
      <TalentCalculatorContent searchParams={searchParams} theme={theme} />
    </Suspense>
  </>;
}

async function TalentCalculatorContent({
  searchParams,
  theme,
}: {
  searchParams: PageProps["searchParams"];
  theme: NonNullable<ReturnType<typeof getTalentSpecTheme>>;
}) {
  const { data, search, builds } = await loadTalentPage(theme, await searchParams, "en");
  return <TalentCalculatorWithLocalization key={data ? `${theme.slug}-${data.heroSubtreeId}` : theme.slug} data={data} theme={theme} lang="en" search={search} builds={builds} />;
}
