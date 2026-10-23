"use client";

import { Link, useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import type { AdminLang } from "../../admin/text";
import { pageLabel } from "../../blocks/contract";
import { AdminSurface } from "../AdminSurface";
import { Button } from "../valyro-ui/basic/Button";
import { Select } from "../valyro-ui/forms/Select";

const COPY = {
  ru: {
    title: "Новая страница",
    hint: (site: string) => `Сайт «${site}». Выберите страницу сайта, которую нужно переопределить. Документ создаётся, когда вы нажмёте кнопку — до этого ничего не сохраняется.`,
    field: "Страница сайта",
    placeholder: "Выберите страницу",
    empty: "У этого сайта нет страниц, которые можно переопределить.",
    used: "уже есть документ",
    create: "Создать черновик и открыть редактор",
    creating: "Создаю…",
    change: "Другой сайт",
    cancel: "Отмена",
    failed: "Не удалось создать страницу. Попробуйте ещё раз.",
  },
  en: {
    title: "New page",
    hint: (site: string) => `Site “${site}”. Choose the site page to override. The document is created when you press the button — nothing is saved before that.`,
    field: "Site page",
    placeholder: "Choose a page",
    empty: "This site has no overridable pages.",
    used: "already has a document",
    create: "Create draft and open the editor",
    creating: "Creating…",
    change: "Change site",
    cancel: "Cancel",
    failed: "Could not create the page. Try again.",
  },
};

export function NewPagePanel({ site, pages, locale, lang }: { site: { id: string; name: string }; pages: { id: string; taken: boolean }[]; locale: "en" | "ru"; lang: AdminLang }) {
  const t = COPY[lang];
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const [page, setPage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = page !== "" && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/pages?locale=${locale}&fallback-locale=none&draft=true&depth=0`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site: site.id, slug: page, _status: "draft" }),
      });
      const body = (await response.json().catch(() => null)) as { doc?: { id?: string | number }; errors?: { message?: string }[] } | null;
      if (!response.ok || body?.doc?.id === undefined) throw new Error(body?.errors?.[0]?.message || t.failed);
      startRouteTransition(() => router.push(`/admin/collections/pages/${body.doc!.id}?locale=${locale}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.failed);
      setBusy(false);
    }
  };

  return <AdminSurface lang={lang}>
    <header className="gd-workspace__head"><div><h1>{t.title}</h1><p>{t.hint(site.name)}</p></div></header>
    <form onSubmit={submit} className="gd-workspace__filters">
      <label><span>{t.field}</span>
        <Select aria-label={t.field} value={page} onValueChange={setPage} placeholder={t.placeholder} emptyText={t.empty}
          options={pages.map((p) => ({ value: p.id, label: pageLabel(p.id, lang), description: `${p.id}${p.taken ? ` · ${t.used}` : ""}`, disabled: p.taken }))} /></label>
      <div className="gd-workspace__actions">
        <Button type="submit" variant="accent" disabled={!ready} loading={busy}>{busy ? t.creating : t.create}</Button>
        <Button asChild variant="secondary"><Link href={`/admin/select-site?collection=pages&locale=${locale}`}>{t.change}</Link></Button>
        <Button asChild variant="secondary"><Link href={`/admin/collections/pages?locale=${locale}`}>{t.cancel}</Link></Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  </AdminSurface>;
}
