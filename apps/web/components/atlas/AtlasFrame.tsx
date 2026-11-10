import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { AtlasFrameFooter, AtlasFrameShell } from "@gildra/atlas-ui";
import { atlasScenes, type AtlasScene, type AtlasSceneId } from "@/lib/atlas/scenes";
import { footerCopy } from "./footerLinks";
import { GildraCrest } from "@/components/brand/GildraCrest";
import styles from "./AtlasFrame.module.css";
import { FooterNavigation } from "./FooterNavigation";
import { FooterLanguage } from "./FooterLanguage";

type ShellProps = ComponentProps<typeof AtlasFrameShell>;

export type AtlasFrameProps = Omit<ShellProps, "footer" | "ember" | "glow" | "horizon"> & {
  /** Section scene from lib/atlas/scenes.ts (art, crop, shade, tint, sparks, living light); explicit props override it. */
  scene?: AtlasSceneId;
  /** Site footer under the content: brand, grouped links, language and motion controls, legal notice.
   *  An object replaces some of its parts (the 404 links its languages to the hubs; the 404 of unmatched URLs picks its language on the client). */
  footer?: boolean | { legal?: ReactNode; links?: ReactNode; description?: ReactNode; language?: ReactNode; motion?: ReactNode };
};

/** The site's one legal line (Blizzard trademark notice) in a language: one short sentence pair. */
const LEGAL = {
  en: "World of Warcraft® is a registered trademark of Blizzard Entertainment, Inc. WowArcana is an unofficial fan site, not affiliated with Blizzard.",
  ru: "World of Warcraft® — зарегистрированный товарный знак Blizzard Entertainment, Inc. WowArcana — неофициальный фанатский сайт, не связанный с Blizzard.",
} as const;
export const atlasLegal = (locale: "en" | "ru") => LEGAL[locale];

const footerParts = (locale: "en" | "ru") => ({
  brand: <Link href={`${locale === "ru" ? "/ru" : ""}/wow`} prefetch={false} className={styles.seal} aria-label="WowArcana"><GildraCrest height={56} className={styles.crest} /><span>WowArcana</span></Link>,
  description: footerCopy[locale].description,
  legal: atlasLegal(locale),
  links: <FooterNavigation locale={locale} />,
  language: <FooterLanguage locale={locale} />,
});

/** The frame's legal line on its own, for a page that cannot sit in the frame (the full-bleed story reader). */
export function AtlasLegalFooter({ lang }: { lang: "en" | "ru" }) {
  return <AtlasFrameFooter locale={lang} {...footerParts(lang)} />;
}

/**
 * The app's page frame: the kit's AtlasFrameShell (@gildra/atlas-ui) with the
 * site's scenes (lib/atlas/scenes.ts) and legal line (lib/games/registry.ts).
 * Pages import it from "@/components/atlas" as before.
 */
export function AtlasFrame({ scene, art, artPosition, artShade, tint, footer = true, lang, ...rest }: AtlasFrameProps) {
  const preset: Partial<AtlasScene> = scene ? atlasScenes[scene] : {};
  const locale = lang === "ru" ? "ru" : "en";
  return (
    <AtlasFrameShell
      {...rest}
      lang={lang}
      art={art ?? preset.art}
      artPosition={artPosition ?? preset.position}
      artShade={artShade ?? preset.shade ?? "default"}
      tint={tint ?? preset.tint}
      ember={preset.ember}
      horizon={art ? undefined : preset.horizon}
      // The scene's living light only belongs to the scene's own painting.
      glow={art ? undefined : preset.glow}
      footer={footer ? { ...footerParts(locale), ...(typeof footer === "object" ? footer : {}) } : false}
    />
  );
}
