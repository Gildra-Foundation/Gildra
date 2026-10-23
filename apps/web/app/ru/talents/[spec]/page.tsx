import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TalentCalculatorWithLocalization } from "@/components/talents/TalentCalculatorWithLocalization";
import { TalentCalculatorSkeleton } from "@/components/TalentCalculatorSkeleton";
import { getMidnightTalentPageData } from "@/lib/talentCalculatorData";
import { getTalentSpecTheme, talentSpecThemes } from "@/lib/talentSpecThemes";
import { pairedAlternates } from "@/lib/seo/metadata";
import { getTalentSpecStyles } from "@/lib/talentSpecStyles";

// Only the known specs exist: any other slug is a 404 before the loading screen streams.
export const dynamicParams = false;
export const generateStaticParams = () => talentSpecThemes.map(({ slug }) => ({ spec: slug }));

type PageProps = { params: Promise<{ spec: string }>; searchParams: Promise<{ hero?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const theme = getTalentSpecTheme((await params).spec);
  if (!theme) return {};
  return {
    title: `Таланты ${theme.specNameRu} — Gildra`,
    description: `Интерактивный калькулятор талантов ${theme.specNameRu} (${theme.classNameRu}) для Midnight из community snapshot с указанным происхождением.`,
    alternates: pairedAlternates("ru", `/talents/${theme.slug}`),
    robots: { index: false, follow: true },
  };
}

export default async function RussianTalentSpecPage({ params, searchParams }: PageProps) {
  const { spec } = await params;
  const theme = getTalentSpecTheme(spec);
  if (!theme) notFound();
  const specStyles = await getTalentSpecStyles(theme);
  return <>
    <style key={theme.slug} data-talent-spec-styles={theme.slug}>{specStyles}</style>
    <Suspense fallback={<TalentCalculatorSkeleton lang="ru" />}>
      <RussianTalentCalculator spec={spec} searchParams={searchParams} theme={theme} />
    </Suspense>
  </>;
}

async function RussianTalentCalculator({
  spec,
  searchParams,
  theme,
}: {
  spec: string;
  searchParams: PageProps["searchParams"];
  theme: NonNullable<ReturnType<typeof getTalentSpecTheme>>;
}) {
  // Load first, render after: JSX built inside try/catch would escape the catch (react-hooks/error-boundaries).
  let data: Awaited<ReturnType<typeof getMidnightTalentPageData>> | null = null;
  try {
    const heroPathId = Number((await searchParams).hero) || undefined;
    data = await getMidnightTalentPageData(spec, heroPathId, "ru");
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error(`[ru/talents/${spec}] data load failed`, error);
  }
  if (!data) return <TalentCalculatorWithLocalization key={theme.slug} data={null} theme={theme} lang="ru" />;
  return <TalentCalculatorWithLocalization key={`${theme.slug}-${data.heroSubtreeId}`} data={data} theme={theme} lang="ru" />;
}
