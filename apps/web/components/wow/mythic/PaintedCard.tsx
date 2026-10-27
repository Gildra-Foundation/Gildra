import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import { Card } from "@gildra/atlas-ui/valyro-ui/data-display/Card";
import bridge from "@gildra/atlas-ui/valyroAtlasBridge.module.css";
import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonFrameArtwork } from "@/lib/wow/dungeonArtDirection";
import { MythicHubLinkButton as AtlasLinkButton } from "./hub/MythicHubLinkButton";
import { mythicHubThemes, mythicHubFrameLayout } from "./hub/mythicHubThemes";
import { mythicHubControlLayout } from "./hub/mythicHubControls";
import { MythicHubOrnaments } from "./hub/MythicHubOrnaments";
import cardStyles from "./dungeonCardGrid.module.css";

const sizes = "(max-width: 900px) 100vw, 50vw";

/**
 * The hub's entity card (design.md §3.2): a painting in the kit's frame above the kit's plaque.
 * The title is the card's one real link; the painting repeats it for the pointer only.
 */
export function PaintedCard({ kit, id, href, external = false, scene, priority = false, location, title, titleLang, facts, description, action, actionLabel, source, cardData }: {
  kit: DungeonSlug;
  id: string;
  href: string;
  /** The destination is another site (the title and the button open a new tab). */
  external?: boolean;
  scene: string;
  priority?: boolean;
  location?: string;
  title: string;
  titleLang?: string;
  facts?: ReactNode;
  description: string;
  action: string;
  /** Screen-reader ending of the button, e.g. the entity name. */
  actionLabel?: string;
  source?: { href: string; label: string };
  cardData?: Record<string, string>;
}) {
  const linkProps = external ? { target: "_blank", rel: "noreferrer" } : {};
  const TitleLink = external ? "a" : Link;
  return <Card
    padding="none"
    variant="outline"
    className={`${bridge.scope} ${cardStyles.hubCard}`}
    data-mythic-card-theme={mythicHubThemes[kit].motif}
    {...cardData}
    style={{ ...mythicHubFrameLayout(kit), ...mythicHubControlLayout(kit) } as CSSProperties}
  >
    <article className={cardStyles.content} aria-labelledby={id}>
      <TitleLink className={cardStyles.artLink} href={href} tabIndex={-1} aria-hidden="true" {...linkProps}>
        <div className={cardStyles.frameCanvas}>
          <div className={cardStyles.artWindow} data-hub-card-art>
            <div className={cardStyles.sceneLayer} data-hub-dungeon-scene>
              <Image src={scene} alt="" fill sizes={sizes} priority={priority} className={cardStyles.sceneImage} data-hub-dungeon-image />
            </div>
            <span className={cardStyles.artShade} aria-hidden="true" />
          </div>
          <Image src={dungeonFrameArtwork(kit)} alt="" fill sizes={sizes} className={cardStyles.frameImage} aria-hidden="true" />
        </div>
      </TitleLink>
      <div className={cardStyles.body} data-mythic-material-panel={kit}>
        {location ? <p className={cardStyles.location}><MapPin aria-hidden="true" />{location}</p> : null}
        <h3 className={cardStyles.title} id={id} lang={titleLang}><TitleLink href={href} {...linkProps}>{title}</TitleLink></h3>
        {facts ? <div className={cardStyles.facts}>{facts}</div> : null}
        <p className={cardStyles.description}>{description}</p>
        <footer className={cardStyles.footer}>
          <AtlasLinkButton className={cardStyles.openRoute} href={href} external={external} prefetch={false} iconAfter={external ? <ArrowUpRight aria-hidden="true" /> : undefined}>
            {action}{actionLabel ? <span className={cardStyles.srOnly}>: {actionLabel}</span> : null}
          </AtlasLinkButton>
          {source ? <a className={cardStyles.source} href={source.href} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight aria-hidden="true" /></a> : null}
        </footer>
        <MythicHubOrnaments slug={kit} />
      </div>
    </article>
  </Card>;
}
