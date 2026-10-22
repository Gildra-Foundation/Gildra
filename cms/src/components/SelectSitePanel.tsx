"use client";

import { Link } from "@payloadcms/ui";
import React, { useEffect, useRef, useState } from "react";

import { type AdminLang, ADMIN_TEXT } from "../admin/text";
import { useChooseSite } from "./SiteLink";

import { AdminSurface } from "./AdminSurface";
import { Button } from "./valyro-ui/basic/Button";

type Site = { id: string; name: string; domain: string; game: string };

const GAME_LABEL: Record<string, string> = { wow: "World of Warcraft", lol: "League of Legends" };

export function SelectSitePanel({
  sites,
  target,
  listHref,
  collection,
  lang,
}: {
  sites: Site[];
  target: string;
  listHref: string;
  collection: string;
  lang: AdminLang;
}) {
  const t = ADMIN_TEXT[lang];
  const noun = t.nouns[collection] ?? collection;
  const heading = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const chooseSite = useChooseSite();
  useEffect(() => heading.current?.focus(), []);

  if (sites.length === 0) {
    return (
      <AdminSurface lang={lang}><p role="alert" tabIndex={-1} ref={heading}>{t.chooseSiteNone(noun)} <Link href={listHref}>{t.back}</Link></p></AdminSurface>
    );
  }
  return (
    <AdminSurface lang={lang}>
      <p tabIndex={-1} ref={heading} style={{ outline: "none", maxWidth: 640 }}>
        {t.chooseSiteIntro(noun)}
      </p>
      <ul className="gd-choose">
        {sites.map((site) => (
          <li key={site.id}>
            <Button variant="secondary"
              type="button"
              className={`gd-choose__site gd-site--${site.game}`}
              disabled={busy !== null}
              loading={busy === site.id}
              aria-label={t.createOn(noun, site.name)}
              onClick={() => {
                setBusy(site.id);
                chooseSite(site.id, target);
              }}
            >
              <span className="gd-site__game">{GAME_LABEL[site.game] ?? site.game}</span>
              <strong>{busy === site.id ? t.chooseSiteOpening(site.name) : site.name}</strong>
              <span className="gd-muted">{site.domain}</span>
            </Button>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 16 }}>
        <Link href={listHref}>{t.cancel}</Link>
      </p>
    </AdminSurface>
  );
}
