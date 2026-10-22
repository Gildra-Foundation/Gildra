"use client";

import type { AdminLang } from "../../admin/text";
import { Button } from "../valyro-ui/basic/Button";

export function Pager({ page, totalPages, totalDocs, busy, onPage, lang }: {
  page: number; totalPages: number; totalDocs: number; busy: boolean; onPage: (page: number) => void; lang: AdminLang;
}) {
  return <nav className="gd-workspace__pager" aria-label={lang === "ru" ? "Страницы результатов" : "Result pages"}>
    <span>{lang === "ru" ? `Всего: ${totalDocs} · страница ${page} из ${Math.max(1, totalPages)}` : `${totalDocs} total · page ${page} of ${Math.max(1, totalPages)}`}</span>
    <Button variant="secondary" size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{lang === "ru" ? "Назад" : "Previous"}</Button>
    <Button variant="secondary" size="sm" disabled={busy || page >= totalPages} onClick={() => onPage(page + 1)}>{lang === "ru" ? "Далее" : "Next"}</Button>
  </nav>;
}
