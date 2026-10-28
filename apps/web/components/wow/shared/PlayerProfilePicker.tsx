"use client";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, UserRound } from "lucide-react";
import { AtlasValyroScope } from "@gildra/atlas-ui/AtlasValyroScope";
import { AtlasValyroSelect } from "@gildra/atlas-ui/AtlasValyroSelect";
import { PortalContainerContext, useIsClient } from "@gildra/atlas-ui/valyro-ui/primitives/Portal";
import { ResilientImage } from "@/components/media/ResilientImage";
import { talentSpecThemes } from "@/lib/talentSpecThemes";
import { playerClasses, playerSpecs, type PlayerProfile } from "../mythic/playerTools";
import { playerToolsCopy } from "../mythic/playerToolsCopy";
import { pullRoleCopy } from "../mythic/pullRoleCopy";
import type { PullRoleSelection } from "../mythic/pullRole";
import styles from "./playerProfilePicker.module.css";

// These existing specialization portraits replace the calculator's class-icon fallbacks.
const specPortraits: Record<number, string> = {
  103: "feral-druid", 104: "guardian-druid", 105: "restoration-druid",
  1468: "preservation-evoker", 256: "discipline-priest", 257: "holy-priest",
  250: "blood-dk", 255: "survival-hunter", 65: "holy-paladin", 66: "prot-paladin",
  73: "prot-warrior", 267: "destro-lock", 268: "brewmaster-monk",
  270: "mistweaver-monk", 581: "vengeance-dh", 1480: "devourer-dh",
};

function portrait(src: string | undefined, kind: "class" | "spec") {
  const fallback = kind === "class" ? <UserRound aria-hidden="true" /> : <Sparkles aria-hidden="true" />;
  return <span className={styles.portrait} data-player-icon={kind} aria-hidden="true">
    <ResilientImage src={src} width={30} height={30} alt="" fallback={fallback} />
  </span>;
}

export function PlayerProfilePicker({ locale, themeClassName, profile, onProfileChange, onRoleChange }: {
  locale: "ru" | "en";
  themeClassName: string;
  profile: PlayerProfile;
  onProfileChange: (profile: PlayerProfile) => void;
  onRoleChange: (role: PullRoleSelection) => void;
}) {
  const copy = playerToolsCopy[locale], roles = pullRoleCopy[locale];
  const id = useId(), isClient = useIsClient();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const classOptions = [{ value: "", label: copy.noClass, icon: portrait(undefined, "class") }, ...playerClasses.map(entry => ({
    value: String(entry.id), label: entry.name[locale],
    icon: portrait(talentSpecThemes.find(theme => theme.classId === entry.id)?.classIconUrl, "class"),
  }))];
  const specOptions = [{ value: "", label: copy.noSpec, icon: portrait(undefined, "spec") }, ...playerSpecs.filter(entry => entry.classId === profile.classId).map(entry => ({
    value: String(entry.id), label: entry.name[locale], description: roles[entry.role],
    icon: portrait(specPortraits[entry.id] ? `/assets/specs/${specPortraits[entry.id]}.jpg` : talentSpecThemes.find(theme => theme.specId === entry.id)?.iconUrl, "spec"),
  }))];

  return <PortalContainerContext.Provider value={container}>
    <div className={styles.fields} data-testid="pull-player-picker">
      <div className={styles.field}>
        <label htmlFor={`${id}-class`}>{copy.classLabel}</label>
        <AtlasValyroSelect id={`${id}-class`} className={styles.trigger} size="lg" placeholder={copy.noClass} aria-label={copy.classLabel}
          value={profile.classId?.toString() ?? ""} options={classOptions}
          onValueChange={value => onProfileChange({ classId: Number(value) || null, specId: null })} />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-spec`}>{copy.specLabel}</label>
        <AtlasValyroSelect id={`${id}-spec`} className={styles.trigger} size="lg" aria-label={copy.specLabel}
          placeholder={profile.classId ? copy.noSpec : copy.selectClass} disabled={!profile.classId}
          value={profile.specId?.toString() ?? ""} options={profile.classId ? specOptions : []}
          onValueChange={value => {
            const spec = playerSpecs.find(entry => entry.id === Number(value) && entry.classId === profile.classId);
            onProfileChange({ classId: profile.classId, specId: spec?.id ?? null });
            if (spec) onRoleChange(spec.role);
          }} />
      </div>
    </div>
    {/* Keep fixed menus outside the route's blurred glass, with this dungeon's own tokens. */}
    {isClient && typeof document !== "undefined" && createPortal(<AtlasValyroScope locale={locale} className={`${themeClassName} ${styles.menuTheme}`}>
      <div ref={setContainer} data-testid="player-picker-layer" />
    </AtlasValyroScope>, document.body)}
  </PortalContainerContext.Provider>;
}
