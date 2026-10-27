import Image from "next/image";
import { ArrowRight, ExternalLink } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton } from "@/components/atlas";
import type { Lang as Locale } from "@/lib/i18n-paths";

type IdentityLink = { href: string; label: string };

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", source: "Источник" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", source: "Source" },
} as const;

/** Short identity page of a section whose details are not published yet: hero, actions and one source link. */
export function IdentityStatusPage({
  locale,
  eyebrow,
  title,
  summary,
  sourceUrl,
  sourceLabel,
  links = [],
  parent,
  art,
  artPosition,
  tint,
  emblem,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  summary: string;
  /** @deprecated Patch, season and check date are internal facts; they are no longer shown. */
  patch?: string;
  /** @deprecated See `patch`. */
  season?: string;
  sourceUrl: string;
  sourceLabel: string;
  /** @deprecated See `patch`. */
  lastVerifiedAt?: string;
  links?: IdentityLink[];
  /** Section the page belongs to, shown in the breadcrumbs (path without the /ru prefix). */
  parent?: IdentityLink;
  /** Page artwork behind the hero (a project illustration that fits the section). */
  art?: string;
  artPosition?: string;
  /** Glow colour of the atmosphere, e.g. the class colour. */
  tint?: string;
  /** Identity icon left of the title (class or specialization icon). */
  emblem?: string;
}) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const crumbs = [{ label: text.wow, href: `${prefix}/wow` }, ...(parent ? [{ label: parent.label, href: `${prefix}${parent.href}` }] : []), { label: title }];
  return (
    <AtlasFrame lang={locale} art={art} artPosition={artPosition} tint={tint}>
      <AtlasHero
        emblem={emblem ? <Image src={emblem} alt="" width={62} height={62} style={{ borderRadius: "50%", objectFit: "cover" }} /> : undefined}
        breadcrumbs={crumbs}
        breadcrumbsLabel={text.breadcrumbs}
        eyebrow={eyebrow}
        title={title}
        lede={summary}
        actions={<>
          {/* One primary action per block (design rule 8); the rest stay secondary. */}
          {links.map((link, index) => <AtlasLinkButton key={link.href} href={`${prefix}${link.href}`} variant={index === 0 ? "primary" : "secondary"} iconAfter={<ArrowRight aria-hidden="true" />}>{link.label}</AtlasLinkButton>)}
          <AtlasLinkButton href={sourceUrl} external variant="ghost" iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}: {sourceLabel}</AtlasLinkButton>
        </>}
      />
    </AtlasFrame>
  );
}
