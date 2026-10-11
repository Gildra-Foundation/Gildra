import { ArrowRight, BookOpen, ExternalLink, Hourglass } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection } from "@/components/atlas";
import { formatAtlasDate, formatSeason } from "@/components/atlas/format";

type Locale = "en" | "ru";
type IdentityLink = { href: string; label: string };

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", noticeTitle: "Раздел в подготовке", patch: "Патч", verified: "проверено", source: "Источник" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", noticeTitle: "Section in preparation", patch: "Patch", verified: "verified", source: "Source" },
} as const;

/** Honest placeholder for a section whose details are not published yet. */
export function IdentityStatusPage({
  locale,
  eyebrow,
  title,
  summary,
  patch,
  season,
  sourceUrl,
  sourceLabel,
  lastVerifiedAt,
  links = [],
  parent,
  notice,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  summary: string;
  patch: string;
  season: string;
  sourceUrl: string;
  sourceLabel: string;
  lastVerifiedAt: string;
  links?: IdentityLink[];
  /** Section the page belongs to, shown in the breadcrumbs (path without the /ru prefix). */
  parent?: IdentityLink;
  /** Extra status sentence shown before the confirmed facts. */
  notice?: string;
}) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const crumbs = [{ label: text.wow, href: `${prefix}/wow` }, ...(parent ? [{ label: parent.label, href: `${prefix}${parent.href}` }] : []), { label: title }];
  return (
    <AtlasFrame lang={locale}>
      <AtlasHero
        breadcrumbs={crumbs}
        breadcrumbsLabel={text.breadcrumbs}
        emblem={<BookOpen />}
        eyebrow={eyebrow}
        title={title}
        lede={summary}
        actions={<>
          {links.map((link) => <AtlasLinkButton key={link.href} href={`${prefix}${link.href}`} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{link.label}</AtlasLinkButton>)}
          <AtlasLinkButton href={sourceUrl} external variant="ghost" iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}: {sourceLabel}</AtlasLinkButton>
        </>}
      />
      {/* One status line: what is confirmed and when; the lede already says what will come. */}
      <AtlasSection>
        <AtlasNotice tone="caution" icon={<Hourglass />} title={text.noticeTitle}>
          {notice ? <>{notice} </> : null}
          {text.patch} {patch} · {formatSeason(season, locale)} · {text.verified} {formatAtlasDate(lastVerifiedAt, locale)}
        </AtlasNotice>
      </AtlasSection>
    </AtlasFrame>
  );
}
