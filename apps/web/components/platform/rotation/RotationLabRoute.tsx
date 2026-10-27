import { Suspense } from "react";
import Image from "next/image";
import { AtlasFrame, AtlasHero, AtlasNotice } from "@/components/atlas";
import { midnightSpecializations } from "@/lib/data/wow";
import type { RotationPreset } from "@/lib/platform/rotation/types";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { RotationLabPage } from "./RotationLabPage";
import { RotationSpecMenu } from "./RotationSpecMenu";
import { rotationLabCopy, type RotationLabLocale } from "./rotationLabCopy";
import styles from "./rotationLabShell.module.css";

type Props = {
  locale: RotationLabLocale;
  theme: TalentSpecTheme;
  preset: Promise<RotationPreset>;
  characterSlug?: string;
  dataMode: "fixture" | "battle-net";
};

/**
 * /wow/rotation/[spec]: the hero renders at once from the spec theme; the lab
 * streams in when the SimulationCraft preset arrives.
 */
export function RotationLabRoute({ locale, theme, preset, characterSlug, dataMode }: Props) {
  const copy = rotationLabCopy[locale];
  const ru = locale === "ru";
  const prefix = ru ? "/ru" : "";
  const classSlug = midnightSpecializations.find((spec) => spec.slug === theme.slug)?.classSlug;
  const className = ru ? theme.classNameRu : theme.className;
  const specName = ru ? theme.specNameRu : theme.specName;
  return (
    <AtlasFrame lang={locale} scene="classes" still tint={`rgba(${theme.ambientRgb}, .2)`} dataAttributes={{ "data-rotation-route": theme.slug }}>
      <AtlasHero
        breadcrumbs={[
          { label: copy.wow, href: `${prefix}/wow` },
          ...(classSlug ? [{ label: className, href: `${prefix}/wow/classes#${classSlug}` }] : []),
          { label: copy.crumb },
        ]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        toolbar={<RotationSpecMenu activeSlug={theme.slug} lang={locale} copy={copy.specMenu} />}
        emblem={<Image className={styles.specEmblem} src={theme.iconUrl} alt="" width={56} height={56} unoptimized priority />}
        eyebrow={`${className} · ${ru ? theme.roleRu : theme.role}`}
        title={copy.title(specName)}
        lede={copy.lede}
      />
      <Suspense fallback={<div className={styles.loading} role="status" aria-busy="true"><AtlasNotice title={copy.loading} /></div>}>
        <RotationLabContent locale={locale} preset={preset} characterSlug={characterSlug} dataMode={dataMode} />
      </Suspense>
    </AtlasFrame>
  );
}

async function RotationLabContent({ locale, preset, characterSlug, dataMode }: Omit<Props, "theme">) {
  const resolved = await preset;
  return <RotationLabPage preset={resolved} lang={locale} characterSlug={characterSlug} dataMode={dataMode} />;
}
