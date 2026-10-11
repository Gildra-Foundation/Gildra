import { ArrowRight, BookOpen, CalendarCheck, ExternalLink, Hourglass, Layers } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasLinkButton, AtlasMetaList, AtlasNotice, AtlasSection } from "@/components/atlas";
import { formatAtlasDate, formatSeason } from "@/components/atlas/format";
import styles from "./identityStatusPage.module.css";

type Locale = "en" | "ru";
type IdentityLink = { href: string; label: string };

const copy = {
  ru: { breadcrumbs: "Навигация", wow: "World of Warcraft", noticeTitle: "Раздел в подготовке", notice: "Подробности появятся здесь после проверки данных. Ниже — то, что уже подтверждено.", patch: "Патч", season: "Сезон", verified: "Проверено", next: "Куда дальше", source: "Источник" },
  en: { breadcrumbs: "Breadcrumbs", wow: "World of Warcraft", noticeTitle: "Section in preparation", notice: "Details will appear here once the data is verified. Below is what is already confirmed.", patch: "Patch", season: "Season", verified: "Verified", next: "Where to next", source: "Source" },
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
  /** Replaces the default "details later" notice. */
  notice?: string;
}) {
  const text = copy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const crumbs = [{ label: text.wow, href: `${prefix}/wow` }, ...(parent ? [{ label: parent.label, href: `${prefix}${parent.href}` }] : []), { label: title }];
  return (
    <AtlasFrame lang={locale}>
      <AtlasHero breadcrumbs={crumbs} breadcrumbsLabel={text.breadcrumbs} emblem={<BookOpen />} eyebrow={eyebrow} title={title} lede={summary} />
      <AtlasSection>
        <AtlasNotice tone="caution" icon={<Hourglass />} title={text.noticeTitle}>{notice ?? text.notice}</AtlasNotice>
        <AtlasMetaList columns={3} className={styles.facts} items={[
          { icon: <Layers />, label: text.patch, value: patch },
          { icon: <BookOpen />, label: text.season, value: formatSeason(season, locale) },
          { icon: <CalendarCheck />, label: text.verified, value: formatAtlasDate(lastVerifiedAt, locale) },
        ]} />
      </AtlasSection>
      <AtlasSection title={links.length ? text.next : undefined} level={3}>
        <div className={styles.actions}>
          {links.map((link) => <AtlasLinkButton key={link.href} href={`${prefix}${link.href}`} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{link.label}</AtlasLinkButton>)}
          <AtlasLinkButton href={sourceUrl} external variant="ghost" iconAfter={<ExternalLink aria-hidden="true" />}>{text.source}: {sourceLabel}</AtlasLinkButton>
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
