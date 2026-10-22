import type { ComponentProps } from "react";
import Link from "next/link";
import { AtlasFrameShell } from "@gildra/atlas-ui/AtlasFrameShell";
import "@/lib/atlas/placeholders";
import { atlasScenes, type AtlasScene, type AtlasSceneId } from "@/lib/atlas/scenes";
import { GAMES } from "@/lib/games/registry";
import { t } from "@/lib/i18n";

type ShellProps = ComponentProps<typeof AtlasFrameShell>;

export type AtlasFrameProps = Omit<ShellProps, "footer" | "ember" | "glow"> & {
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
