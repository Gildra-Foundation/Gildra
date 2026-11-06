"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { MaterialButton, MaterialLinkButton, MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import { TalentBuildCalculator } from "@/components/wow/shared/TalentBuildCalculator";
import { CHARACTERS_KIT } from "@/lib/wow/charactersKit";
import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import auditStyles from "./characterProfile.module.css";
import styles from "./playerProfile.module.css";

type Copy = { talents: string; copyBuild: string; copied: string; openCalculator: string };

/** The player's active talents in the shared calculator, read-only, with the in-game string to copy or open in our calculator. */
export function PlayerTalents({ data, specSlug, loadout, calculatorHref, localePrefix, copy }: { data: TalentCalculatorData; specSlug: string; loadout: string; calculatorHref: string; localePrefix: "" | "/ru"; copy: Copy }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copyBuild = async () => {
    try {
      await navigator.clipboard.writeText(loadout);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { /* The clipboard can be refused; the calculator link still carries the build. */ }
  };
  return (
    <AtlasSection
      id="talents"
      title={copy.talents}
      className={styles.section}
      aside={<div className={styles.talentActions}>
        <MaterialButton kit={CHARACTERS_KIT} onClick={() => void copyBuild()} icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}>
          <span aria-live="polite">{copied ? copy.copied : copy.copyBuild}</span>
        </MaterialButton>
        <MaterialLinkButton kit={CHARACTERS_KIT} variant="primary" href={calculatorHref} icon={<Sparkles aria-hidden="true" />}>{copy.openCalculator}</MaterialLinkButton>
      </div>}
    >
      <MaterialPlaque kit={CHARACTERS_KIT} className={auditStyles.tool}>
        <TalentBuildCalculator mode="shared" readOnly data={data} specSlug={specSlug} loadout={loadout} localePrefix={localePrefix} />
      </MaterialPlaque>
    </AtlasSection>
  );
}
