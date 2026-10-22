"use client";

import { FieldError, useDocumentInfo, useField } from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import React from "react";

import { pageLabel, pagesForSite, pageUrls } from "../../blocks/contract";
import { AdminSurface } from "../../components/AdminSurface";
import { Select } from "../../components/valyro-ui/forms/Select";
import { useSitePage } from "./useSitePage";
import "./blocksEditor.css";

/**
 * Page id ("wow/privacy") picked from the site's overridable pages instead of
 * typed. Fixed once the document exists: another page is another document.
 */
export const PageIdField: TextFieldClientComponent = ({ path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path });
  const { id } = useDocumentInfo();
  const { site, page, lang } = useSitePage();
  const ru = lang === "ru";
  const options = pagesForSite(site).map((p) => {
    const urls = pageUrls(p);
    return { value: p.id, label: pageLabel(p.id, lang), description: `${p.id} · ${urls.en} · ${urls.ru}` };
  });
  const locked = readOnly || id !== undefined;
  if (value && !options.some((o) => o.value === value)) options.push({ value, label: value, description: ru ? "нет в списке страниц сайта" : "not in the site's page list" });
  return (
    <AdminSurface lang={lang}>
      <div className="gd-pageid field-type">
        <label className="field-label" id="gd-pageid-label">
          {ru ? "Страница сайта" : "Site page"}
          <span className="required">*</span>
        </label>
        <Select
          aria-labelledby="gd-pageid-label"
          options={options}
          value={value ?? ""}
          onValueChange={(next) => setValue(next)}
          placeholder={site ? (ru ? "Выберите страницу" : "Choose a page") : ru ? "Сначала выберите сайт" : "Choose a site first"}
          emptyText={ru ? "У этого сайта нет страниц, которые можно переопределить." : "This site has no overridable pages."}
          disabled={locked || !site}
          invalid={showError}
        />
        {showError ? <FieldError path={path} message={errorMessage} showError /> : null}
        <p className="gd-pageid__hint">
          {locked
            ? page
              ? `${page.id} · ${pageUrls(page).en} · ${pageUrls(page).ru}`
              : ru ? "Страница сайта не меняется после создания." : "The site page is fixed after creation."
            : ru
              ? "Список страниц, которые сайт умеет брать из CMS. Остальные разделы собраны в коде."
              : "Pages the site can take from the CMS. Other sections are built in code."}
        </p>
      </div>
    </AdminSurface>
  );
};
