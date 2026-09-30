"use client";

import { type FormEvent, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity, BarChart3, ChevronRight, CircleAlert, Database, Eye, EyeOff, RefreshCw, Server, ShieldCheck, Swords,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestJSON } from "./client";
import type { PanelUser } from "./types";

const ApiConsoleDashboard = dynamic(
  () => import("./ApiConsoleDashboard").then((module) => module.ApiConsoleDashboard),
  { ssr: false, loading: () => <LoadingScreen /> },
);

const GenshinImpactCatalog = dynamic(
  () => import("./GenshinImpactCatalog").then((module) => module.GenshinImpactCatalog),
);

export function ApiConsole({ consolePath, returnTo }: { consolePath: string[]; returnTo?: string }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [checking, setChecking] = useState(true);
  const isPublicGenshin = consolePath[0] === "genshin-impact";

  useEffect(() => {
    if (isPublicGenshin) {
      setChecking(false);
      return;
    }
    setChecking(true);
    requestJSON<{ user: PanelUser | null }>("/api/api-console/session")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, [isPublicGenshin]);

  // The Genshin catalog is a read-only public encyclopedia. Keep the
  // operational/admin sections behind the panel session, while allowing the
  // catalog page to be opened directly from api.gildra.net.
  if (isPublicGenshin) {
    return <PublicGenshinCatalog />;
  }

  if (checking) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={setUser} returnTo={returnTo} />;
  return <ApiConsoleDashboard user={user} consolePath={consolePath} onLogout={() => setUser(null)} />;
}

function PublicGenshinCatalog() {
  return (
    <main data-api-console className="min-h-screen bg-[#090b10] text-[#e7eaf1]">
      <div className="mx-auto max-w-[1480px] p-4 sm:p-6 lg:p-8">
        <GenshinImpactCatalog />
      </div>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Gildra API">
      <div className="grid size-9 place-items-center border border-[#8b7138] bg-[#171716] text-[#e2c171] [clip-path:polygon(7px_0,100%_0,100%_calc(100%-7px),calc(100%-7px)_100%,0_100%,0_7px)]">
        <Swords className="size-[18px]" strokeWidth={1.5} />
      </div>
      {!compact && <div><div className="font-[family-name:var(--display)] text-[15px] font-bold tracking-[.18em] text-[#e7c878]">GILDRA</div><div className="text-[10px] uppercase tracking-[.28em] text-[#657087]">API Console</div></div>}
    </div>
  );
}

function LoadingScreen() {
  return <main data-api-console className="grid min-h-screen place-items-center bg-[#090b10] text-[#c9a24f]"><RefreshCw className="size-6 animate-spin" aria-label="Загрузка" /></main>;
}

function LoginScreen({ onLogin, returnTo }: { onLogin: (user: PanelUser) => void; returnTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => { fetch("/readyz").then((r) => setReady(r.ok)).catch(() => setReady(false)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const submittedEmail = String(form.get("email") ?? "").trim();
    const submittedPassword = String(form.get("password") ?? "");
    setSubmitting(true); setError("");
    try {
      const result = await requestJSON<{ user: PanelUser }>("/v1/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: submittedEmail, password: submittedPassword }),
      });
      onLogin(result.user);
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) window.location.assign(returnTo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить вход");
    } finally { setSubmitting(false); }
  }

  return (
    <main data-api-console className="relative flex min-h-screen flex-col overflow-hidden bg-[#090b10] text-[#e8ebf2]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(201,162,79,.12),transparent_34%),linear-gradient(rgba(255,255,255,.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.015)_1px,transparent_1px)] bg-[size:auto,42px_42px,42px_42px]" />
      <header className="relative flex h-20 items-center justify-between border-b border-[#222735] px-5 sm:px-10"><BrandMark /><div className="hidden items-center gap-2 text-[10px] uppercase tracking-[.16em] text-[#778198] sm:flex"><ShieldCheck className="size-4 text-[#9b8349]" />Защищённая зона</div></header>
      <section className="relative grid flex-1 place-items-center px-4 py-12">
        <div className="grid w-full max-w-[1060px] items-center gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
          <div className="mx-auto w-full max-w-[540px]">
          <div className="mb-7 text-center lg:text-left"><p className="mb-2 text-[10px] uppercase tracking-[.24em] text-[#9c834b]">Управление данными и API</p><h1 className="font-[family-name:var(--display)] text-3xl font-semibold tracking-tight sm:text-4xl">Вход в панель</h1><p className="mt-2 text-sm text-[#7f899d]">Используйте аккаунт администратора Gildra</p></div>
          <Card className="border-[#32313a] bg-[#10131b]/95 shadow-[0_30px_90px_rgba(0,0,0,.55)] [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)]">
            <CardContent className="p-6 sm:p-8">
              {error && <Alert variant="destructive" className="mb-6 rounded-sm border-[#693b3e] bg-[#2a1518] text-[#ef9a9d]"><CircleAlert className="size-4" /><AlertTitle>Вход не выполнен</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
              <form onSubmit={submit}>
                <FieldGroup className="gap-5">
                  <Field><FieldLabel htmlFor="panel-email" className="text-[10px] uppercase tracking-[.14em] text-[#8c96a9]">Email</FieldLabel><Input id="panel-email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-11 rounded-sm border-[#303645] bg-[#0a0d13] px-3 text-sm placeholder:text-[#4f596b] focus-visible:border-[#b4954f]" /></Field>
                  <Field><FieldLabel htmlFor="panel-password" className="text-[10px] uppercase tracking-[.14em] text-[#8c96a9]">Пароль</FieldLabel><div className="relative"><Input id="panel-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" className="h-11 rounded-sm border-[#303645] bg-[#0a0d13] px-3 pr-11 text-sm placeholder:text-[#4f596b] focus-visible:border-[#b4954f]" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-11 place-items-center text-[#707b90] hover:text-[#d7bb73]" aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></Field>
                  <Field orientation="horizontal" className="items-center gap-2"><Checkbox id="remember" checked={remember} onCheckedChange={(value) => setRemember(value === true)} className="rounded-sm border-[#596275] data-[state=checked]:border-[#c9a24f] data-[state=checked]:bg-[#c9a24f]" /><FieldLabel htmlFor="remember" className="text-xs font-normal text-[#8b95a8]">Оставаться в системе</FieldLabel></Field>
                  <Button disabled={submitting} className="h-11 w-full rounded-sm bg-[#c8a14d] font-semibold text-[#171205] hover:bg-[#e0bd68]">{submitting ? <RefreshCw className="size-4 animate-spin" /> : <><span>Войти в панель</span><ChevronRight className="size-4" /></>}</Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
          <div className="mt-6 grid grid-cols-2 gap-px border border-[#242a37] bg-[#242a37] sm:grid-cols-4 lg:hidden">
            {["API", "Postgres", "ClickHouse", "Redis"].map((name) => <div key={name} className="flex items-center justify-center gap-2 bg-[#0d1017] px-2 py-3 text-[10px] uppercase tracking-[.11em] text-[#778196]"><span className={cn("size-1.5 rounded-full", ready === false ? "bg-[#d95c55]" : ready === true ? "bg-[#58ad67] shadow-[0_0_8px_#58ad67]" : "bg-[#596275]")} />{name}</div>)}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-[#667086] lg:justify-start"><ShieldCheck className="size-3.5 text-[#9b8349]" />Сессия хранится только в защищённой cookie</div>
          </div>
          <Card className="hidden rounded-sm border-[#343a47] bg-[#0e121a]/90 shadow-[0_28px_80px_rgba(0,0,0,.45)] lg:block [clip-path:polygon(12px_0,calc(100%-12px)_0,100%_12px,100%_calc(100%-12px),calc(100%-12px)_100%,12px_100%,0_calc(100%-12px),0_12px)]">
            <CardHeader className="border-b border-[#303645] px-6 py-5"><CardTitle className="text-center font-[family-name:var(--display)] text-xs uppercase tracking-[.16em] text-[#d5b25d]">Состояние системы</CardTitle></CardHeader>
            <CardContent className="p-6">{[["API", Activity], ["PostgreSQL", Database], ["ClickHouse", BarChart3], ["Redis", Server]].map(([name, StatusIcon]) => { const IconComponent = StatusIcon as typeof Activity; return <div key={name as string} className="flex items-center gap-4 border-b border-[#2a303d] py-5 last:border-b-0"><IconComponent className="size-5 text-[#aa8c49]" strokeWidth={1.5} /><span className="flex-1 text-sm text-[#9da6b7]">{name as string}</span><span className={cn("size-2 rounded-full", ready === false ? "bg-[#d95c55]" : ready === true ? "bg-[#58ad67] shadow-[0_0_8px_#58ad67]" : "bg-[#596275]")} /></div>; })}</CardContent>
          </Card>
        </div>
      </section>
      <footer className="relative border-t border-[#1d222e] px-5 py-5 text-center text-[10px] uppercase tracking-[.15em] text-[#515b6e]">Gildra Foundation · API Console</footer>
    </main>
  );
}
