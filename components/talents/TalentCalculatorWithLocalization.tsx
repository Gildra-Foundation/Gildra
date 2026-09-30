"use client";

import { useEffect, useState } from "react";
import { TalentCalculator } from "@/components/TalentCalculator";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";

type Props = { data: TalentCalculatorData | null; theme: TalentSpecTheme; lang: "ru" | "en" };
type SpellTranslation = { name: string; description: string };

function withTranslations(data: TalentCalculatorData, translations: Record<string, SpellTranslation>): TalentCalculatorData {
  const localize = <T extends { spellId?: number; name: string; description: string }>(entry: T): T => {
    const translated = entry.spellId ? translations[String(entry.spellId)] : undefined;
    return translated ? {
      ...entry,
      name: translated.name || entry.name,
      description: translated.description || entry.description,
    } : entry;
  };

  return {
    ...data,
    trees: {
      class: { ...data.trees.class, nodes: data.trees.class.nodes.map((node) => ({ ...node, choices: node.choices.map(localize) })) },
      hero: { ...data.trees.hero, nodes: data.trees.hero.nodes.map((node) => ({ ...node, choices: node.choices.map(localize) })) },
      spec: { ...data.trees.spec, nodes: data.trees.spec.nodes.map((node) => ({ ...node, choices: node.choices.map(localize) })) },
    },
    source: {
      ...data.source,
      label: data.source.label.includes("Wowhead") ? data.source.label : `${data.source.label} · ${data.source.kind === "community_snapshot" ? "Wowhead" : "Blizzard"}`,
    },
  };
}

export function TalentCalculatorWithLocalization({ data, theme, lang }: Props) {
  const [renderData, setRenderData] = useState(data);

  useEffect(() => {
    setRenderData(data);
    if (!data || lang !== "ru" || data.source.kind !== "community_snapshot") return;

    const ids = [...new Set(Object.values(data.trees)
      .flatMap((tree) => tree.nodes.flatMap((node) => node.choices.map((choice) => choice.spellId ?? 0)))
      .filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (!ids.length) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ lang, ids: ids.join(",") });
    fetch(`/api/wow/talent-localizations?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as { translations?: Record<string, SpellTranslation> };
      })
      .then((body) => {
        if (!controller.signal.aborted && body?.translations && Object.keys(body.translations).length) {
          setRenderData(withTranslations(data, body.translations));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [data, lang]);

  return <TalentCalculator data={renderData} theme={theme} />;
}
