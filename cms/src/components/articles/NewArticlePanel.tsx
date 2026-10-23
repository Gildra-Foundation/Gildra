"use client";

import { Link, useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import type { AdminLang } from "../../admin/text";
import { AdminSurface } from "../AdminSurface";
import { Button } from "../valyro-ui/basic/Button";
import { TextInput } from "../valyro-ui/forms/TextInput";

const COPY = {
  ru: {
    title: "Новая статья",
    hint: (site: string, language: string) => `Сайт «${site}», язык текста: ${language}. Статья создаётся, когда вы нажмёте кнопку — до этого ничего не сохраняется.`,
    field: "Заголовок",
    placeholder: "Например, «Лучшие классы для рейда»",
    create: "Создать черновик и перейти к тексту",
    creating: "Создаю…",
    change: "Другой сайт",
    cancel: "Отмена",
    failed: "Не удалось создать статью. Попробуйте ещё раз.",
    languages: { ru: "русский", en: "английский" },
  },
  en: {
    title: "New article",
    hint: (site: string, language: string) => `Site “${site}”, content language: ${language}. The article is created when you press the button — nothing is saved before that.`,
    field: "Title",
    placeholder: "For example, “Best classes for the raid”",
    create: "Create draft and continue to the text",
    creating: "Creating…",
    change: "Change site",
    cancel: "Cancel",
    failed: "Could not create the article. Try again.",
    languages: { ru: "Russian", en: "English" },
  },
};

export function NewArticlePanel({ site, locale, lang }: { site: { id: string; name: string }; locale: "en" | "ru"; lang: AdminLang }) {
  const t = COPY[lang];
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ready = title.trim().length > 0 && !busy;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/guides?locale=${locale}&fallback-locale=none&draft=true&depth=0`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), site: site.id, _status: "draft" }),
      });
      const body = (await response.json().catch(() => null)) as { doc?: { id?: string | number } } | null;
      if (!response.ok || body?.doc?.id === undefined) throw new Error(String(response.status));
      startRouteTransition(() => router.push(`/admin/collections/guides/${body.doc!.id}?locale=${locale}`));
    } catch {
      setError(true);
      setBusy(false);
    }
  };

  return <AdminSurface lang={lang}>
    <header className="gd-workspace__head"><div><h1>{t.title}</h1><p>{t.hint(site.name, t.languages[locale])}</p></div></header>
    <form onSubmit={submit} className="gd-workspace__filters">
      <label><span>{t.field}</span>
        <TextInput value={title} maxLength={200} autoFocus required placeholder={t.placeholder} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className="gd-workspace__actions">
        <Button type="submit" variant="accent" disabled={!ready} loading={busy}>{busy ? t.creating : t.create}</Button>
        <Button asChild variant="secondary"><Link href={`/admin/select-site?collection=guides&locale=${locale}`}>{t.change}</Link></Button>
        <Button asChild variant="secondary"><Link href={`/admin/articles?locale=${locale}`}>{t.cancel}</Link></Button>
      </div>
      {error ? <p role="alert">{t.failed}</p> : null}
    </form>
  </AdminSurface>;
}
