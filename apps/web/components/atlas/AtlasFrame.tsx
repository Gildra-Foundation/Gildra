import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { AtlasFrameFooter, AtlasFrameShell } from "@gildra/atlas-ui";
import { atlasScenes, type AtlasScene, type AtlasSceneId } from "@/lib/atlas/scenes";
import { ATLAS_FOOTER_LINKS } from "./footerLinks";
import { GildraCrest } from "@/components/brand/GildraCrest";
import styles from "./AtlasFrame.module.css";

type ShellProps = ComponentProps<typeof AtlasFrameShell>;

export type AtlasFrameProps = Omit<ShellProps, "footer" | "ember" | "glow" | "horizon"> & {
  /** Section scene from lib/atlas/scenes.ts (art, crop, shade, tint, sparks, living light); explicit props override it. */
  scene?: AtlasSceneId;
  /** Site footer under the content: crest on a rail, footer links with "Less motion", the one-line legal notice.
   *  An object replaces the line's text and links (the 404 of unmatched URLs picks its language on the client). */
  footer?: boolean | { legal: ReactNode; links: ReactNode; motion?: ReactNode };
};

/** The site's one legal line (Blizzard trademark notice) in a language: one short sentence pair. */
const LEGAL = {
  en: "World of Warcraft® is a registered trademark of Blizzard Entertainment, Inc. Gildra is an unofficial fan site, not affiliated with Blizzard.",
  ru: "World of Warcraft® — зарегистрированный товарный знак Blizzard Entertainment, Inc. Gildra — неофициальный фанатский сайт, не связанный с Blizzard.",
} as const;
export const atlasLegal = (locale: "en" | "ru") => LEGAL[locale];

const footerParts = (locale: "en" | "ru") => ({
  brand: <span className={styles.seal}><GildraCrest height={44} className={styles.crest} /><span>WOWARCANA</span></span>,
  legal: atlasLegal(locale),
  links: <>
    {ATLAS_FOOTER_LINKS.map((link) => (
      <Link key={link.href} href={`${locale === "ru" ? "/ru" : ""}${link.href}`} prefetch={false}>{link[locale]}</Link>
    ))}
  </>,
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
