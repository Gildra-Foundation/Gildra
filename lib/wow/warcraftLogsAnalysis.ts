export type WarcraftLogsCooldownReference = { spellId: number; name: string; expectedIntervalSeconds: number; expectedFirstUseSeconds?: number; expectedUses?: number[] };
export type WarcraftLogsSimComparison = { status: "comparable" | "duration_mismatch" | "target_mismatch" | "dynamic_targets" | "death" | "unavailable"; durationDeltaPercent?: number; observedTargets: number; simulatedTargets?: number };
export type WarcraftLogsEvent = { type?: string; timestamp?: number; abilityGameID?: number; sourceID?: number; targetID?: number; amount?: number; absorbed?: number; resourceChange?: number; waste?: number };
export type WarcraftLogsFinding = { id: string; severity: "high" | "medium" | "info"; title: string; detail: string; timestampMs: number; timestampLabel: string; evidence: string; sourceURL?: string };

export type WarcraftLogsAnalysis = {
  report: { code: string; title: string; visibility: string };
  fight: { id: number; name: string; encounterID: number; durationSeconds: number; kill: boolean };
  actor: { id: number; name: string; server: string; spec: string; talentImportCode?: string };
  metrics: { dps: number; simDps?: number; simDeltaPercent?: number; casts: number; castsPerMinute: number; buffUptimePercent: number | null; buffName: string; driftSeconds: number | null; overcapPercent: number | null; deaths: number; damageSource: "wcl_table" | "events_fallback"; comparison: WarcraftLogsSimComparison };
  findings: WarcraftLogsFinding[];
  sourceURL: string;
};

export type AnalyzePayload = {
  reportData: { report: {
    code: string; title: string; visibility: string; startTime: number;
    fights: Array<{ id: number; name: string; encounterID: number; startTime: number; endTime: number; kill: boolean; friendlyPlayers?: number[]; friendlySpecs?: string[]; talentImportCode?: string }>;
    masterData: { actors: Array<{ id: number; name: string; server?: string; type?: string }>; abilities: Array<{ gameID: number; name: string }> };
    casts: { data: unknown }; buffs: { data: unknown }; resources: { data: unknown }; damage?: { data: unknown }; damageTable?: { data?: { entries?: Array<{ total?: number; targets?: Array<{ name?: string }> }> } }; deaths: { data: unknown };
  } | null };
};

function events(value: unknown): WarcraftLogsEvent[] {
  const list = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data) ? (value as { data: WarcraftLogsEvent[] }).data : [];
  return list.filter((event): event is WarcraftLogsEvent => Boolean(event && typeof event === "object" && Number.isFinite(event.timestamp)));
}

function damageTableSummary(value: unknown) {
  const wrapper = value && typeof value === "object" ? value as { data?: unknown } : null;
  const data = wrapper?.data && typeof wrapper.data === "object" ? wrapper.data as { entries?: unknown } : null;
  if (!data || !Array.isArray(data.entries)) return null;
  const entries = data.entries.filter((entry): entry is { total?: number; targets?: Array<{ name?: string }> } => Boolean(entry && typeof entry === "object"));
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.total ?? 0)), 0);
  const targets = new Set(entries.flatMap((entry) => Array.isArray(entry.targets) ? entry.targets.map((target) => target?.name).filter((name): name is string => Boolean(name)) : []));
  return { total, targets: targets.size };
}

export function timestampLabel(milliseconds: number) {
  const total = Math.max(0, Math.round(milliseconds / 1000)), minutes = Math.floor(total / 60), seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function finding(id: string, severity: WarcraftLogsFinding["severity"], title: string, detail: string, timestampMs: number, evidence: string): WarcraftLogsFinding {
  return { id, severity, title, detail, timestampMs, timestampLabel: timestampLabel(timestampMs), evidence };
}

export function analyzeWarcraftLog(payload: AnalyzePayload, input: { fightID: number; actorID: number; specSlug: string; locale?: "en" | "ru"; simDps?: number; simDurationSeconds?: number; simTargets?: number; cooldowns: WarcraftLogsCooldownReference[] }): WarcraftLogsAnalysis {
  const locale = input.locale === "en" ? "en-US" : "ru-RU";
  const text = (ru: string, en: string) => input.locale === "en" ? en : ru;
  const decimal = (value: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const integer = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  const report = payload.reportData.report;
  if (!report) throw new Error("report_not_found");
  const fight = report.fights.find((entry) => entry.id === input.fightID);
  const actor = report.masterData.actors.find((entry) => entry.id === input.actorID && entry.type === "Player");
  if (!fight || !actor || !fight.friendlyPlayers?.includes(actor.id)) throw new Error("fight_actor_not_found");
  const actorIndex = fight.friendlyPlayers.indexOf(actor.id), observedSpec = fight.friendlySpecs?.[actorIndex] ?? "Unknown";
  if (input.specSlug && !observedSpec.toLowerCase().replaceAll(" ", "-").includes(input.specSlug.split("-")[0])) throw new Error("specialization_mismatch");
  const durationMs = Math.max(1, fight.endTime - fight.startTime), durationSeconds = durationMs / 1000;
  const abilities = new Map(report.masterData.abilities.map((ability) => [ability.gameID, ability.name]));
  const castEvents = events(report.casts.data).filter((event) => event.type === "cast" || !event.type);
  const damageEvents = events(report.damage?.data);
  const resourceEvents = events(report.resources.data);
  const deathEvents = events(report.deaths.data).filter((event) => event.targetID === actor.id);
  const buffEvents = events(report.buffs.data).filter((event) => event.targetID === actor.id);
  const tableDamage = damageTableSummary(report.damageTable);
  const fallbackDamage = damageEvents.reduce((sum, event) => sum + Math.max(0, Number(event.amount ?? 0)), 0);
  const damage = tableDamage?.total ?? fallbackDamage;
  const fallbackTargets = new Set(damageEvents.map((event) => event.targetID).filter((target): target is number => Number.isInteger(target) && Number(target) > 0));
  const observedTargets = tableDamage?.targets ?? fallbackTargets.size;
  const dps = damage / durationSeconds;

  const buffStarts = new Map<number, number>(), buffDurations = new Map<number, number>(), buffApplications = new Map<number, number>();
  for (const event of buffEvents.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
    const ability = Number(event.abilityGameID), at = Math.min(durationMs, Math.max(0, Number(event.timestamp) - fight.startTime));
    if (!ability) continue;
    if (event.type === "applybuff" || event.type === "applybuffstack") {
      if (!buffStarts.has(ability)) buffStarts.set(ability, at);
      if (event.type === "applybuff") buffApplications.set(ability, (buffApplications.get(ability) ?? 0) + 1);
    }
    if (event.type === "removebuff" && buffStarts.has(ability)) {
      buffDurations.set(ability, (buffDurations.get(ability) ?? 0) + Math.max(0, at - buffStarts.get(ability)!)); buffStarts.delete(ability);
    }
  }
  for (const [ability, start] of buffStarts) buffDurations.set(ability, (buffDurations.get(ability) ?? 0) + Math.max(0, durationMs - start));
  const dynamicBuffs = [...buffDurations].filter(([ability, uptime]) => uptime < durationMs * 0.98 || (buffApplications.get(ability) ?? 0) > 1);
  const topBuff = dynamicBuffs.sort((a, b) => b[1] - a[1])[0];
  const buffUptimePercent = topBuff ? Math.min(100, topBuff[1] / durationMs * 100) : null;

  const durationDeltaPercent = input.simDurationSeconds && input.simDurationSeconds > 0 ? Math.abs(durationSeconds - input.simDurationSeconds) / input.simDurationSeconds * 100 : undefined;
  const durationMismatch = input.simDurationSeconds ? Math.abs(durationSeconds - input.simDurationSeconds) > Math.max(2, input.simDurationSeconds * 0.02) : false;
  const comparison: WarcraftLogsSimComparison = !input.simDps || !input.simDurationSeconds || !input.simTargets
    ? { status: "unavailable", observedTargets }
    : deathEvents.length
      ? { status: "death", durationDeltaPercent, observedTargets, simulatedTargets: input.simTargets }
      : durationMismatch
        ? { status: "duration_mismatch", durationDeltaPercent, observedTargets, simulatedTargets: input.simTargets }
        : observedTargets !== input.simTargets
          ? { status: "target_mismatch", durationDeltaPercent, observedTargets, simulatedTargets: input.simTargets }
          : observedTargets > 1
            ? { status: "dynamic_targets", durationDeltaPercent, observedTargets, simulatedTargets: input.simTargets }
            : { status: "comparable", durationDeltaPercent, observedTargets, simulatedTargets: input.simTargets };

  const comparableCooldowns = comparison.status === "comparable" ? input.cooldowns.filter((item) => item.spellId > 0 && item.expectedIntervalSeconds >= 5).slice(0, 12) : [];
  let driftSeconds: number | null = comparableCooldowns.length ? 0 : null;
  const findings: WarcraftLogsFinding[] = [];
  for (const reference of comparableCooldowns) {
    const castTimes = castEvents.filter((event) => event.abilityGameID === reference.spellId).map((event) => (Number(event.timestamp) - fight.startTime) / 1000).filter((time) => time >= 0 && time <= durationSeconds).sort((a, b) => a - b);
    const expectedFirst = Math.max(0, reference.expectedFirstUseSeconds ?? 0);
    const expectedUses = (reference.expectedUses ?? []).filter((time) => Number.isFinite(time) && time >= 0 && time <= durationSeconds).slice(0, 20).sort((a, b) => a - b);
    if (expectedUses.length) {
      for (let index = 0; index < expectedUses.length; index += 1) {
        const expectedAt = expectedUses[index], actualAt = castTimes[index];
        if (actualAt === undefined) {
          const overdue = durationSeconds - expectedAt;
          if (overdue < 1) continue;
          driftSeconds! += overdue;
          findings.push(finding(`missing-cooldown-${reference.spellId}-${index}`, "high", text(`Пропущено применение ${reference.name}`, `Missed cast of ${reference.name}`), text(`SimC использует способность примерно на ${decimal(expectedAt)} сек., но до конца боя в WCL применения нет.`, `SimC uses the ability around ${decimal(expectedAt)} sec, but WCL has no matching cast before the fight ends.`), expectedAt * 1000, text(`WCL Casts · spell ${reference.spellId} · нет применения для SimC-окна ${timestampLabel(expectedAt * 1000)}`, `WCL Casts · spell ${reference.spellId} · no cast for the SimC window at ${timestampLabel(expectedAt * 1000)}`)));
          continue;
        }
        const drift = Math.max(0, actualAt - expectedAt);
        if (drift < 1) continue;
        driftSeconds! += drift;
        findings.push(finding(`drift-${reference.spellId}-${index}`, drift >= 5 ? "high" : "medium", text(`Задержка ${reference.name}: ${decimal(drift)} сек.`, `${reference.name} delay: ${decimal(drift)} sec`), text(`Применение было на ${decimal(actualAt)} сек.; точный SimC-timestamp — ${decimal(expectedAt)} сек.`, `The cast occurred at ${decimal(actualAt)} sec; the exact SimC timestamp was ${decimal(expectedAt)} sec.`), actualAt * 1000, `WCL Casts · spell ${reference.spellId} · ${timestampLabel(actualAt * 1000)}`));
      }
      continue;
    }
    if (!castTimes.length) {
      const overdue = Math.max(0, durationSeconds - expectedFirst);
      if (overdue >= 1) {
        driftSeconds! += overdue;
        findings.push(finding(`missing-cooldown-${reference.spellId}`, "high", text(`${reference.name} не использован`, `${reference.name} was not used`), text(`SimC использует способность примерно на ${decimal(expectedFirst)} сек., но в WCL нет ни одного применения.`, `SimC uses the ability around ${decimal(expectedFirst)} sec, but WCL has no casts.`), expectedFirst * 1000, text(`WCL Casts · spell ${reference.spellId} · 0 применений`, `WCL Casts · spell ${reference.spellId} · 0 casts`)));
      }
      continue;
    }
    const firstDrift = Math.max(0, castTimes[0] - expectedFirst);
    if (firstDrift >= 1) {
      driftSeconds! += firstDrift;
      findings.push(finding(`drift-first-${reference.spellId}`, firstDrift >= 5 ? "high" : "medium", text(`Поздний первый ${reference.name}: ${decimal(firstDrift)} сек.`, `Late first ${reference.name}: ${decimal(firstDrift)} sec`), text(`Первое применение было на ${decimal(castTimes[0])} сек.; SimC-эталон — ${decimal(expectedFirst)} сек.`, `The first cast occurred at ${decimal(castTimes[0])} sec; the SimC reference was ${decimal(expectedFirst)} sec.`), castTimes[0] * 1000, `WCL Casts · spell ${reference.spellId} · ${timestampLabel(castTimes[0] * 1000)}`));
    }
    for (let index = 1; index < castTimes.length; index += 1) {
      const gap = castTimes[index] - castTimes[index - 1], drift = Math.max(0, gap - reference.expectedIntervalSeconds);
      if (drift < 1) continue;
      driftSeconds! += drift;
      findings.push(finding(`drift-${reference.spellId}-${index}`, drift >= 5 ? "high" : "medium", text(`Задержка ${reference.name}: ${decimal(drift)} сек.`, `${reference.name} delay: ${decimal(drift)} sec`), text(`Между применениями прошло ${decimal(gap)} сек.; SimC-эталон — ${decimal(reference.expectedIntervalSeconds)} сек.`, `There were ${decimal(gap)} sec between casts; the SimC reference was ${decimal(reference.expectedIntervalSeconds)} sec.`), castTimes[index] * 1000, `WCL Casts · spell ${reference.spellId} · ${timestampLabel(castTimes[index] * 1000)}`));
    }
    const expectedNext = castTimes.at(-1)! + reference.expectedIntervalSeconds, overdue = durationSeconds - expectedNext;
    if (overdue >= 1) {
      driftSeconds! += overdue;
      findings.push(finding(`missing-cooldown-tail-${reference.spellId}`, overdue >= 5 ? "high" : "medium", text(`Пропущено повторное применение ${reference.name}`, `Missed repeat cast of ${reference.name}`), text(`Следующее применение ожидалось примерно на ${decimal(expectedNext)} сек., но бой продолжался ещё ${decimal(overdue)} сек.`, `The next cast was expected around ${decimal(expectedNext)} sec, but the fight continued for another ${decimal(overdue)} sec.`), expectedNext * 1000, text(`WCL Casts · spell ${reference.spellId} · после ${timestampLabel(expectedNext * 1000)} нет применения`, `WCL Casts · spell ${reference.spellId} · no cast after ${timestampLabel(expectedNext * 1000)}`)));
    }
  }
  const gained = resourceEvents.reduce((sum, event) => sum + Math.max(0, Number(event.resourceChange ?? 0)), 0);
  const wasted = resourceEvents.reduce((sum, event) => sum + Math.max(0, Number(event.waste ?? 0)), 0);
  const overcapPercent = gained + wasted > 0 ? wasted / (gained + wasted) * 100 : null;
  const worstWaste = [...resourceEvents].sort((a, b) => Number(b.waste ?? 0) - Number(a.waste ?? 0))[0];
  if (overcapPercent !== null && wasted > 0 && worstWaste) {
    const relative = Number(worstWaste.timestamp) - fight.startTime;
    findings.push(finding("resource-overcap", overcapPercent >= 5 ? "high" : "medium", text(`Потеря ресурса: ${decimal(overcapPercent)}%`, `Resource wasted: ${decimal(overcapPercent)}%`), text(`В бою потеряно ${Math.round(wasted)} ресурса из ${Math.round(gained + wasted)} доступного.`, `${integer(wasted)} resource was wasted out of ${integer(gained + wasted)} available during the fight.`), relative, `WCL Resources · waste ${Math.round(Number(worstWaste.waste ?? 0))} · ${timestampLabel(relative)}`));
  }
  for (const [index, death] of deathEvents.entries()) {
    const relative = Number(death.timestamp) - fight.startTime;
    findings.push(finding(`death-${index}`, "high", text("Смерть персонажа", "Character death"), text("После этой точки фактический DPS нельзя напрямую сравнивать с полным SimC-прогоном.", "After this point, actual DPS cannot be compared directly to a full SimC run."), relative, `WCL Deaths · actor ${actor.id} · ${timestampLabel(relative)}`));
  }
  if (!findings.length) findings.push(finding("clean-run", "info", text("Критичных расхождений не найдено", "No critical discrepancies found"), text("По доступным событиям нет подтверждённого overcap, смерти или задержки отслеживаемых кулдаунов.", "Available events show no confirmed resource overcap, deaths, or delays in tracked cooldowns."), 0, text("WCL Casts, Resources и Deaths · весь бой", "WCL Casts, Resources and Deaths · entire fight")));
  findings.sort((a, b) => (a.severity === "high" ? 0 : a.severity === "medium" ? 1 : 2) - (b.severity === "high" ? 0 : b.severity === "medium" ? 1 : 2) || a.timestampMs - b.timestampMs);
  const sourceURL = `https://www.warcraftlogs.com/reports/${report.code}#fight=${fight.id}&source=${actor.id}`;
  const linkedFindings = findings.slice(0, 12).map((item) => ({ ...item, sourceURL: `${sourceURL}&start=${Math.max(fight.startTime, fight.startTime + item.timestampMs - 5000)}&end=${Math.min(fight.endTime, fight.startTime + item.timestampMs + 5000)}` }));
  return {
    report: { code: report.code, title: report.title, visibility: report.visibility },
    fight: { id: fight.id, name: fight.name, encounterID: fight.encounterID, durationSeconds, kill: fight.kill },
    actor: { id: actor.id, name: actor.name, server: actor.server ?? "", spec: observedSpec, talentImportCode: fight.talentImportCode },
    metrics: { dps, simDps: input.simDps, simDeltaPercent: comparison.status === "comparable" && input.simDps ? (dps - input.simDps) / input.simDps * 100 : undefined, casts: castEvents.length, castsPerMinute: castEvents.length / durationSeconds * 60, buffUptimePercent, buffName: topBuff ? abilities.get(topBuff[0]) ?? `Spell ${topBuff[0]}` : text("Нет данных", "No data"), driftSeconds, overcapPercent, deaths: deathEvents.length, damageSource: tableDamage ? "wcl_table" : "events_fallback", comparison },
    findings: linkedFindings, sourceURL,
  };
}
