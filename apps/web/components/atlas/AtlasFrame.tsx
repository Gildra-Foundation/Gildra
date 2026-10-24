import type { ComponentProps } from "react";
import Link from "next/link";
import { AtlasFrameShell } from "@gildra/atlas-ui";
import { atlasScenes, type AtlasScene, type AtlasSceneId } from "@/lib/atlas/scenes";
import { GAMES } from "@/lib/games/registry";
import { t } from "@/lib/i18n";
import instanceStyles from "./instanceThemes/instance.module.css";
import illidanStyles from "./instanceThemes/illidan.module.css";

type ShellProps = ComponentProps<typeof AtlasFrameShell>;
const themedChapters = new Set<AtlasSceneId | undefined>(["raids", "mythicPlus", "mythicSeasons", "dungeons"]);

function frameScene(scene: AtlasSceneId | undefined) {
  const themed = themedChapters.has(scene);
  const preset: Partial<AtlasScene> = scene && !themed ? atlasScenes[scene] : {};
  return { themed, preset, themeClass: themed ? `${instanceStyles.instance} ${illidanStyles.illidan}` : "" };
}

export type AtlasFrameProps = Omit<ShellProps, "footer" | "ember" | "glow" | "themedArt"> & {
  /** Section scene from lib/atlas/scenes.ts (art, crop, shade, tint, sparks, living light); explicit props override it. */
  scene?: AtlasSceneId;
  /** Slim legal line (Blizzard trademark notice, "What's new", privacy) under the content. */
  footer?: boolean;
};

/**
 * The app's page frame: the kit's AtlasFrameShell (@gildra/atlas-ui) with the
 * site's scenes (lib/atlas/scenes.ts) and legal line (lib/games/registry.ts).
 * Pages import it from "@/components/atlas" as before.
 */
export function AtlasFrame({ scene, art, artPosition, artShade, tint, footer = true, lang, className, dataAttributes, ...rest }: AtlasFrameProps) {
  const { themed, preset, themeClass } = frameScene(scene);
  const locale = lang === "ru" ? "ru" : "en";
  // Chapter selection uses the character's world. Entity pages keep the actual
  // encounter artwork and its matching light/morph (e.g. the Voidspire eye).
  return (
    <AtlasFrameShell
      {...rest}
      lang={lang}
      className={`${className ?? ""} ${themeClass}`.trim()}
      dataAttributes={{ ...dataAttributes, "data-atlas-instance-theme": themed || undefined }}
      themedArt={themed}
      art={art ?? preset.art}
      artPosition={artPosition ?? preset.position}
      artShade={artShade ?? preset.shade ?? "default"}
      tint={tint ?? preset.tint}
      ember={preset.ember}
      // The scene's living light only belongs to the scene's own painting.
      glow={art ? undefined : preset.glow}
      footer={footer ? {
        legal: t(locale)(GAMES.wow.legal),
        links: <>
          <Link href={locale === "ru" ? "/ru/wow/whats-new" : "/wow/whats-new"} prefetch={false}>{t(locale)("What's new")}</Link>
          <Link href={locale === "ru" ? "/ru/privacy" : "/privacy"} prefetch={false}>{t(locale)("Privacy Policy")}</Link>
        </>,
      } : false}
    />
  );
}
