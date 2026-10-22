import React from "react";

import { adminLang } from "../admin/text";

type BrandProps = { i18n?: { language?: string } };

/** "Редакция · Network": the shared newsroom of gildra.net and riftden.com. */
function tagline(language: string | undefined) {
  return adminLang(language) === "ru" ? "Редакция · Network" : "Newsroom · Network";
}

/** The GILDRA wordmark of the raids and Mythic+ pages: spaced Alegreya capitals. */
export function Wordmark({ i18n, size = "nav" }: BrandProps & { size?: "nav" | "login" }) {
  return (
    <span className={`gd-wordmark gd-wordmark--${size}`}>
      <span className="gd-wordmark__name">Gildra</span>
      <span className="gd-wordmark__tagline">{tagline(i18n?.language)}</span>
    </span>
  );
}

/** Header mark (start of the breadcrumbs, links to the desk): the wordmark's initial in a bronze frame. */
export function BrandIcon() {
  return (
    <span className="gd-monogram" aria-label="Gildra">
      G
    </span>
  );
}

/** Login and password screens. */
export function BrandLogo({ i18n }: BrandProps) {
  return (
    <span className="gd-logo">
      <Wordmark i18n={i18n} size="login" />
      <small>gildra.net · riftden.com</small>
    </span>
  );
}
