"use client";

import { FieldError, useDocumentInfo, useField, useLocale } from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";
import React, { useEffect, useState } from "react";

import { pageLabel, pagesForSite, pageUrls } from "../../blocks/contract";
import { AdminSurface } from "../../components/AdminSurface";
import type { SelectOption } from "../../components/valyro-ui/forms/Listbox";
import { Select } from "../../components/valyro-ui/forms/Select";
import { useSitePage } from "./useSitePage";
import "./blocksEditor.css";

/** Page ids that already have a document on this site (one document per page). */
function useTakenPages(site: string | null, id: string | number | undefined, skip: boolean): Set<string> {
  const [taken, setTaken] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!site || skip) return;
    let live = true;
    const query = new URLSearchParams({ depth: "0", limit: "100", draft: "true", "select[slug]": "true", "where[site.slug][equals]": site });
    fetch(`/api/pages?${query}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { docs?: { id: unknown; slug?: unknown }[] } | null) => {
        if (!live || !res?.docs) return;
        setTaken(new Set(res.docs.filter((d) => String(d.id) !== String(id) && typeof d.slug === "string").map((d) => d.slug as string)));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [site, id, skip]);
  return taken;
}

/**
 * Page id ("wow/privacy") picked from the site's overridable pages instead of
 * typed. Fixed once the document exists: another page is another document.
 */
export const PageIdField: TextFieldClientComponent = ({ path, readOnly }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path });
  const title = useField<string>({ path: "title" });
  const locale = useLocale();
  const { id, initialData, savedDocumentData } = useDocumentInfo() as { id?: string | number; initialData?: { slug?: unknown }; savedDocumentData?: { slug?: unknown } };
  const { site, page, lang } = useSitePage();
  const ru = lang === "ru";
  // Saved value first: once chosen the page is fixed (the empty draft "Create" opens picks it here).
  const saved = savedDocumentData?.slug ?? initialData?.slug;
  const locked = readOnly || (typeof saved === "string" && saved !== "");
  const taken = useTakenPages(site, id, locked);
  const options: SelectOption[] = pagesForSite(site).map((p) => {
    const urls = pageUrls(p);
    const used = taken.has(p.id);
    return { value: p.id, label: pageLabel(p.id, lang), description: `${p.id} · ${urls.en} · ${urls.ru}${used ? (ru ? " · уже есть документ" : " · already has a document") : ""}`, disabled: used };
  });
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
          onValueChange={(next) => {
            setValue(next);
            // The page's name becomes the title of this language unless the editor typed one.
            if (!title.value) title.setValue(pageLabel(next, locale?.code === "ru" ? "ru" : "en"));
          }}
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
