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
    title: `Таланты ${theme.specNameRu} — Gildra`,
    description: `Калькулятор талантов «${theme.specNameRu}» (${theme.classNameRu}) для Midnight: деревья класса, героя и специализации, импорт и экспорт строки из игры.`,
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
    <Suspense fallback={<TalentCalculatorSkeleton lang="ru" theme={theme} />}>
      <RussianTalentCalculator searchParams={searchParams} theme={theme} />
    </Suspense>
  </>;
}

async function RussianTalentCalculator({
  searchParams,
  theme,
}: {
  searchParams: PageProps["searchParams"];
  theme: NonNullable<ReturnType<typeof getTalentSpecTheme>>;
}) {
  const { data, search, builds } = await loadTalentPage(theme, await searchParams, "ru");
  return <TalentCalculatorWithLocalization key={data ? `${theme.slug}-${data.heroSubtreeId}` : theme.slug} data={data} theme={theme} lang="ru" search={search} builds={builds} />;
}
