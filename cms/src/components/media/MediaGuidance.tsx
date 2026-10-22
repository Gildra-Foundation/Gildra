"use client";

import { useLocale, useTranslation } from "@payloadcms/ui";
import React from "react";

import { AdminSurface } from "../AdminSurface";
import { Badge } from "../valyro-ui/basic/Badge";

/** Format labels come from the collection's actual upload allowlist. */
export function MediaGuidance({ formats }: { formats: string[] }) {
  const { i18n } = useTranslation();
  const locale = useLocale();
  const lang = i18n.language === "en" ? "en" : "ru";
  const current = (locale?.code ?? "en").toUpperCase();

  return (
    <AdminSurface lang={lang}>
      <aside className="gd-media-guide" aria-label={lang === "ru" ? "Об изображении" : "About this image"}>
        <div className="gd-media-guide__formats">
          <strong>{lang === "ru" ? "Форматы" : "Formats"}</strong>
          {formats.map((format) => <Badge key={format} variant="outline">{format}</Badge>)}
        </div>
        <p>{lang === "ru"
          ? `Файл общий для RU и EN. Описание и подпись ниже — для версии ${current}.`
          : `The file is shared by RU and EN. The description and caption below are for the ${current} version.`}</p>
      </aside>
    </AdminSurface>
  );
}
