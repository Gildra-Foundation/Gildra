import "server-only";
import { Activity, Clock3, ShieldCheck, Target } from "lucide-react";
import type { CharacterRunMetrics, CharacterRunScenario, CharacterRunKind } from "@/lib/wow/characterRunHistory";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { characterWorkspaceCopy, workspaceLocale, workspaceNumber, workspaceScenario, workspaceRunLabel, type WorkspaceLocale } from "./characterWorkspaceCopy";
import styles from "./sharedCharacterRunPage.module.css";
import { apiInternalUrl } from "@/lib/env";
import { AtlasLegalFooter } from "@/components/atlas/AtlasFrame";

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
      const base = apiInternalUrl();
      const response = await fetch(`${base}/v1/wow/shared/${token}`, { cache: "no-store" });
      if (response.ok) run = await response.json() as PublicRun;
    } catch { /* The unavailable state below intentionally reveals no lookup details. */ }
  }
  const footer = <AtlasLegalFooter lang={locale === "ru" ? "ru" : "en"} />;
  if (!run) return <><main className={styles.page}><section className={styles.gone}><ShieldCheck aria-hidden="true" /><h1>{t("Ссылка недоступна")}</h1><p>{t("Она была отозвана владельцем, устарела или адрес неверен.")}</p><a href={`${localePrefix}/wow`}>{t("На главную World of Warcraft")}</a></section></main>{footer}</>;
  const primary = run.metrics.dps ?? run.metrics.candidateDps ?? run.metrics.aoeDps;
  const theme = talentSpecThemes.find((entry) => entry.slug === run.specializationSlug);
  const specialization = theme ? locale === "ru" ? `${theme.classNameRu} · ${theme.specNameRu}` : `${theme.className} · ${theme.specName}` : run.specializationSlug;
  return <><main className={styles.page}><section className={styles.card}>
    <header><span aria-hidden="true"><Activity /></span><div><h1>{workspaceRunLabel(locale, run)}</h1><p>{specialization}</p></div></header>
    <div className={styles.heroMetric}><strong>{number(primary, locale)}<i>{primary === undefined ? "" : " DPS"}</i></strong>{run.metrics.deltaPercent !== undefined ? <em>{run.metrics.deltaPercent >= 0 ? "+" : ""}{workspaceNumber(locale, run.metrics.deltaPercent, 2)}%</em> : null}</div>
    <div className={styles.facts}><span><Target aria-hidden="true" /><small>{t("Сценарий")}</small><b>{workspaceScenario(locale, run.scenario.id)}</b><em>{run.scenario.targets} {t("цел.")} · {run.scenario.durationSeconds} {t("сек.")}</em></span><span><Clock3 aria-hidden="true" /><small>{t("Дата")}</small><b>{new Date(run.createdAt).toLocaleDateString(localePrefix === "/ru" ? "ru-RU" : "en-US")}</b></span></div>
  </section></main>{footer}</>;
}
