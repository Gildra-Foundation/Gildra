"use client";

import { Link } from "@payloadcms/ui";
import { useState } from "react";
import type { AdminLang } from "../../admin/text";
import type { PeopleResult, PersonRow } from "../../people/data";
import { AdminSurface } from "../AdminSurface";
import { LocalTime } from "../SiteLink";
import { tableLabels } from "../tableLabels";
import { Badge } from "../valyro-ui/basic/Badge";
import { Button } from "../valyro-ui/basic/Button";
import { ButtonGroup } from "../valyro-ui/basic/ButtonGroup";
import { DataTable, type DataTableColumn } from "../valyro-ui/data-display/DataTable";
import { EmptyState } from "../valyro-ui/data-display/EmptyState";
import { Select } from "../valyro-ui/forms/Select";
import { TextInput } from "../valyro-ui/forms/TextInput";
import { Pager } from "../workspace/Pager";
import { usePage } from "../workspace/usePage";

const COPY = {
  ru: { title: "Пользователи", hint: "Сотрудники редакции и аккаунты читателей сайтов.", staff: "Сотрудники", readers: "Читатели", create: "Добавить сотрудника", searchStaff: "Имя или email", searchReaders: "Email читателя", all: "Все доступные сайты", site: "Сайт", name: "Имя", email: "Email", access: "Доступ и роли", joined: "Создан", open: "Открыть", profile: "Профиль", owner: "Владелец", staffRole: "Сотрудник", verified: "Email подтверждён", unverified: "Email не подтверждён", blocked: "Вход заблокирован", empty: "Пользователи не найдены", error: "Не удалось загрузить пользователей", denied: "Доступ к этому разделу ограничен", retry: "Повторить", loading: "Загружаю пользователей…", active: "активен", memberBlocked: "заблокирован" },
  en: { title: "Users", hint: "Editorial staff and reader accounts across the sites.", staff: "Staff", readers: "Readers", create: "Add staff member", searchStaff: "Name or email", searchReaders: "Reader email", all: "All accessible sites", site: "Site", name: "Name", email: "Email", access: "Access and roles", joined: "Created", open: "Open", profile: "Profile", owner: "Owner", staffRole: "Staff", verified: "Email verified", unverified: "Email not verified", blocked: "Sign-in blocked", empty: "No users found", error: "Could not load users", denied: "Access to this section is restricted", retry: "Try again", loading: "Loading users…", active: "active", memberBlocked: "blocked" },
};

const ROLE = { ru: { admin: "администратор", editor: "редактор", author: "автор", analyst: "аналитик" }, en: { admin: "admin", editor: "editor", author: "author", analyst: "analyst" } };

export function PeoplePanel({ initial, lang }: { initial: PeopleResult; lang: AdminLang }) {
  const t = COPY[lang];
  const [kind, setKind] = useState<"staff" | "readers">("staff");
  const [site, setSite] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ kind, site, q, page: String(page) }).toString();
  const initialQuery = new URLSearchParams({ kind: "staff", site: "", q: "", page: "1" }).toString();
  const { data, error, loading, retry } = usePage<PeopleResult>("/api/admin/users", query, initialQuery, initial);
  const columns: DataTableColumn<PersonRow>[] = [
    { key: "name", header: t.name, cell: (row) => <Link href={row.href}>{row.name || "—"}</Link> },
    { key: "email", header: t.email },
    { key: "sites", header: t.access, cell: (row) => <div className="gd-workspace__badges">
      {row.role ? <Badge color={row.role === "owner" ? "amber" : "gray"}>{row.role === "owner" ? t.owner : t.staffRole}</Badge> : null}
      {row.sites.map((s) => <span key={`${s.name}:${s.role}`}>{s.name} · {ROLE[lang][s.role as keyof typeof ROLE.en] ?? (s.role === "active" ? t.active : s.role === "blocked" ? t.memberBlocked : s.role)}</span>)}
      {row.verified !== null ? <Badge color={row.verified ? "green" : "amber"}>{row.verified ? t.verified : t.unverified}</Badge> : null}
      {row.blocked ? <Badge color="red">{t.blocked}</Badge> : null}
    </div> },
    { key: "createdAt", header: t.joined, cell: (row) => <LocalTime iso={row.createdAt} lang={lang} /> },
    { key: "actions", header: t.open, cell: (row) => <div className="gd-workspace__actions"><Button asChild variant="secondary" size="sm"><Link href={row.href}>{t.open}</Link></Button>{row.profileHref ? <Link href={row.profileHref}>{t.profile}</Link> : null}</div> },
  ];
  return <AdminSurface lang={lang}>
    <header className="gd-workspace__head"><div><h1>{t.title}</h1><p>{t.hint}</p></div>
      {initial.canCreateStaff ? <Button asChild variant="accent"><Link href="/admin/collections/admins/create">{t.create}</Link></Button> : null}
    </header>
    <ButtonGroup label={t.title}><Button variant="secondary" aria-pressed={kind === "staff"} onClick={() => { setKind("staff"); setPage(1); setSite(""); setQ(""); }}>{t.staff}</Button>
      {initial.canReadReaders ? <Button variant="secondary" aria-pressed={kind === "readers"} onClick={() => { setKind("readers"); setPage(1); setSite(""); setQ(""); }}>{t.readers}</Button> : null}
    </ButtonGroup>
    <div className="gd-workspace__filters">
      <label><span>{kind === "staff" ? t.searchStaff : t.searchReaders}</span><TextInput value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder={kind === "staff" ? t.searchStaff : t.searchReaders} /></label>
      <label><span>{t.site}</span><Select aria-label={t.site} disabled={loading} value={site} onValueChange={(value) => { setSite(value); setPage(1); }} options={[{ value: "", label: t.all }, ...(data?.sites ?? initial.sites).map((s) => ({ value: s.id, label: s.name }))]} /></label>
    </div>
    <p role="status" className="gd-workspace__status">{loading ? t.loading : ""}</p>
    {error ? <EmptyState title={error === 403 || error === 401 ? t.denied : t.error} primaryAction={<Button onClick={retry}>{t.retry}</Button>} /> :
      <DataTable data={data?.rows ?? []} columns={columns} label={kind === "staff" ? t.staff : t.readers} loading={loading} locale={lang} labels={tableLabels(lang)} empty={<EmptyState title={t.empty} size="sm" />} />}
    {data ? <Pager page={data.page} totalPages={data.totalPages} totalDocs={data.totalDocs} busy={loading} onPage={setPage} lang={lang} /> : null}
  </AdminSurface>;
}
