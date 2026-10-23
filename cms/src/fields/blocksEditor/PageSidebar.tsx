"use client";

import { useDocumentInfo, useFormFields, useLocale } from "@payloadcms/ui";
import React, { useEffect, useState } from "react";

import { pageUrls, type Lang } from "../../blocks/contract";
import { checkBlocks } from "../../blocks/validate";
import { AdminSurface } from "../../components/AdminSurface";
import { Button } from "../../components/valyro-ui/basic/Button";
import { Dialog } from "../../components/valyro-ui/feedback/Dialog";
import { CodeIcon } from "../../components/valyro-ui/icons";
import { editorText } from "./copy";
import { useSitePage } from "./useSitePage";

const SIDE = {
  ru: {
    page: "Страница сайта",
    fallback: "Если удалить или снять с публикации",
    fallbackText: "сайт вернётся к версии из кода",
    valid: "Блоки соответствуют контракту сайта",
    invalid: (n: number) => `Ошибок в блоках: ${n} — сохранить и опубликовать нельзя`,
    filled: (codes: string) => `Блоки заполнены: ${codes}`,
    missing: (code: string) => `${code}: блоков нет — этот язык показывает страницу из кода`,
    legacy: "Этой страницы нет в списке сайта: сайт её не берёт из CMS.",
  },
  en: {
    page: "Site page",
    fallback: "If deleted or unpublished",
    fallbackText: "the site goes back to the page built in code",
    valid: "Blocks match the site's contract",
    invalid: (n: number) => `${n} block errors — saving and publishing are blocked`,
    filled: (codes: string) => `Blocks filled: ${codes}`,
    missing: (code: string) => `${code}: no blocks — this language shows the page built in code`,
    legacy: "This page is not in the site's list: the site does not take it from the CMS.",
  },
} as const;

type LocaleCounts = Record<string, number>;

/** Block counts per language of the latest draft (the form only holds the current language). */
function useLocaleCounts(id: string | number | undefined, current: string, currentCount: number): LocaleCounts | null {
  const { lastUpdateTime } = useDocumentInfo() as { lastUpdateTime?: number };
  const [stored, setStored] = useState<LocaleCounts | null>(null);
  useEffect(() => {
    if (id === undefined) return setStored({});
    let live = true;
    fetch(`/api/pages/${encodeURIComponent(String(id))}?locale=all&draft=true&depth=0&select[blocks]=true`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: { blocks?: Record<string, unknown> } | null) => {
        if (!live || !doc) return;
        const counts: LocaleCounts = {};
        for (const [code, list] of Object.entries(doc.blocks ?? {})) counts[code] = Array.isArray(list) ? list.length : 0;
        setStored(counts);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [id, lastUpdateTime]);
  return stored ? { en: 0, ru: 0, ...stored, [current]: currentCount } : null;
}

/** Sidebar of the page editor: public URLs, what the site falls back to, checks, read-only JSON. */
export function PageSidebar() {
  const { page, pageId, publicUrl, lang, loading } = useSitePage();
  const { id } = useDocumentInfo();
  const locale = useLocale();
  const blocks = useFormFields(([fields]) => fields.blocks?.value);
  const [json, setJson] = useState(false);
  const s = SIDE[lang as Lang];
  const t = editorText(lang);
  const current = String(locale?.code ?? "en");
  const issues = checkBlocks(blocks, page?.blocks ?? null).length;
  const counts = useLocaleCounts(id, current, Array.isArray(blocks) ? blocks.length : 0);
  if (!pageId || loading) return null;
  const urls = page ? pageUrls(page) : null;
  const link = (path: string) => (publicUrl ? new URL(path, publicUrl).toString() : null);
  const missing = counts ? ["ru", "en"].filter((code) => !counts[code]) : [];
  return (
    <AdminSurface lang={lang}>
      <aside className="gd-pageside">
        {urls ? (
          <section>
            <h3 className="gd-pageside__label">{s.page}</h3>
            <p className="gd-pageside__urls">
              {(["en", "ru"] as const).map((code, index) => {
                const href = link(urls[code]);
                return (
                  <React.Fragment key={code}>
                    {index ? " · " : null}
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer">
                        {urls[code]}
                      </a>
                    ) : (
                      urls[code]
                    )}
                  </React.Fragment>
                );
              })}
            </p>
          </section>
        ) : (
          <p className="gd-pageside__warn">{s.legacy}</p>
        )}
        <section>
          <h3 className="gd-pageside__label">{s.fallback}</h3>
          <p>{s.fallbackText}</p>
        </section>
        <ul className="gd-pageside__checks">
          <li data-state={issues ? "bad" : "ok"}>{issues ? s.invalid(issues) : s.valid}</li>
          {counts && missing.length === 0 ? <li data-state="ok">{s.filled("RU, EN")}</li> : null}
          {missing.map((code) => (
            <li key={code} data-state="warn">
              {s.missing(code.toUpperCase())}
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" leftIcon={<CodeIcon />} onClick={() => setJson(true)}>
          {t.showJson}
        </Button>
        <Dialog open={json} onOpenChange={setJson} title={`${t.readOnlyJson} · ${current.toUpperCase()}`} size="lg" closeLabel={t.close}>
          <pre className="gd-json" tabIndex={0}>
            {JSON.stringify(blocks ?? null, null, 2)}
          </pre>
        </Dialog>
      </aside>
    </AdminSurface>
  );
}
