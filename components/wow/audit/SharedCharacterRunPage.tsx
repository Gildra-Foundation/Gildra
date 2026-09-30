import { Activity, CheckCircle2, Clock3, ShieldCheck, Target } from "lucide-react";
import type { CharacterRunMetrics, CharacterRunScenario, CharacterRunKind } from "@/lib/wow/characterRunHistory";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { characterWorkspaceCopy, workspaceLocale, workspaceNumber, workspaceScenario, workspaceRunLabel, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./sharedCharacterRunPage.module.css";

type PublicRun = {
  schemaVersion: number;
  kind: CharacterRunKind;
  specializationSlug: string;
  gameBuild: string;
  scenario: CharacterRunScenario;
  engine: string;
  metrics: CharacterRunMetrics;
  label: string;
  createdAt: string;
};

function number(value: number | undefined, locale: WorkspaceLocale) { return value === undefined ? "—" : workspaceNumber(locale, value); }

export async function SharedCharacterRunPage({ token, localePrefix }: { token: string; localePrefix: "" | "/ru" }) {
  const locale = workspaceLocale(localePrefix), t = characterWorkspaceCopy(locale);
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  let run: PublicRun | null = null;
  if (valid) {
    try {
      const base = (process.env.API_INTERNAL_URL ?? "http://api:8080").replace(/\/$/, "");
      const response = await fetch(`${base}/v1/wow/shared/${token}`, { cache: "no-store" });
      if (response.ok) run = await response.json() as PublicRun;
    } catch { /* The unavailable state below intentionally reveals no lookup details. */ }
  }
  if (!run) return <main className={styles.page}><section className={styles.gone}><ShieldCheck /><small>{locale === "ru" ? "GILDRA · БЕЗОПАСНАЯ ССЫЛКА" : "GILDRA SECURE SHARE"}</small><h1>{t("Ссылка недоступна")}</h1><p>{t("Она была отозвана владельцем, устарела или адрес неверен.")}</p><a href={`${localePrefix}/wow`}>{t("На главную World of Warcraft")}</a></section></main>;
  const primary = run.metrics.dps ?? run.metrics.candidateDps ?? run.metrics.aoeDps;
  const theme = talentSpecThemes.find((entry) => entry.slug === run.specializationSlug);
  const specialization = theme ? locale === "ru" ? `${theme.classNameRu} · ${theme.specNameRu}` : `${theme.className} · ${theme.specName}` : run.specializationSlug;
  return <main className={styles.page}><section className={styles.card}>
    <header><span><Activity /></span><div><small>{locale === "ru" ? "GILDRA · ПОДТВЕРЖДЁННЫЙ РАСЧЁТ" : "GILDRA VERIFIED RUN"}</small><h1>{workspaceRunLabel(locale, run)}</h1><p>{specialization} · {locale === "ru" ? "сборка" : "build"} {run.gameBuild}</p></div><b><CheckCircle2 />{t("Результат сохранён")}</b></header>
    <div className={styles.heroMetric}><small>{t("Результат расчёта")}</small><strong>{number(primary, locale)}<i>{primary === undefined ? "" : " DPS"}</i></strong>{run.metrics.deltaPercent !== undefined ? <em>{run.metrics.deltaPercent >= 0 ? "+" : ""}{workspaceNumber(locale, run.metrics.deltaPercent, 2)}%</em> : null}</div>
    <div className={styles.facts}><span><Target /><small>{t("Сценарий")}</small><b>{workspaceScenario(locale, run.scenario.id)}</b><em>{run.scenario.targets} {t("цел.")} · {run.scenario.durationSeconds} {t("сек.")}</em></span><span><Activity /><small>{t("Движок")}</small><b>{run.engine}</b><em>{run.metrics.iterations ? `${workspaceNumber(locale, run.metrics.iterations)} ${t("прогонов")}` : t("проверенный прогон")}</em></span><span><Clock3 /><small>{t("Дата")}</small><b>{new Date(run.createdAt).toLocaleDateString(localePrefix === "/ru" ? "ru-RU" : "en-US")}</b><em>{new Date(run.createdAt).toLocaleTimeString(localePrefix === "/ru" ? "ru-RU" : "en-US")}</em></span></div>
    <footer><ShieldCheck /><span><b>{t("Безопасная общая сводка")}</b>{t("Здесь нет OAuth-токена, Battle.net ID, имени персонажа, списка предметов или исходного armory payload.")}</span></footer>
  </section></main>;
}
