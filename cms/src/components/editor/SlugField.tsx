"use client";

import { TextField, useDocumentInfo, useField, useFormFields, useTranslation } from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import React, { useEffect, useRef } from "react";

import { slugify } from "../../utilities/slugify";

/**
 * Slug with a title-driven default: while the document has never been
 * published, the slug follows the title (Russian is transliterated) until the
 * editor types a slug of their own. After the first publication it only changes
 * by hand, because a new slug is a new public URL.
 */
export const SlugField: TextFieldClientComponent = (props) => {
  const { path, readOnly } = props;
  const { value, setValue } = useField<string>({ path });
  const title = useFormFields(([fields]) => fields.title?.value as string | undefined);
  const { hasPublishedDoc, initialData } = useDocumentInfo();
  const publishedSlug = hasPublishedDoc && typeof initialData?.slug === "string" ? initialData.slug : null;
  const { i18n } = useTranslation();
  const ru = i18n.language !== "en";
  const previousTitle = useRef(title);

  useEffect(() => {
    const before = previousTitle.current;
    previousTitle.current = title;
    if (readOnly || hasPublishedDoc || !title || before === title) return;
    // Follow the title only while the slug is empty or still derived from it.
    if (!value || value === slugify(before ?? "")) setValue(slugify(title));
  }, [title, value, hasPublishedDoc, readOnly, setValue]);

  const suggestion = title ? slugify(title) : "";
  return (
    <div className="gd-slug">
      <TextField {...props} />
      {!readOnly && !hasPublishedDoc && suggestion && suggestion !== value ? (
        <button type="button" className="gd-slug__make" onClick={() => setValue(suggestion)}>
          {ru ? "Сделать из заголовка" : "Use the title"}: <code>{suggestion}</code>
        </button>
      ) : null}
      {publishedSlug !== null && value !== publishedSlug ? (
        <p className="gd-slug__note">
          {ru
            ? "Статья уже публиковалась: смена адреса изменит ссылку на сайте, старая перестанет открываться."
            : "This article has been published: a new slug changes its public link and the old one stops working."}
        </p>
      ) : null}
    </div>
  );
};
