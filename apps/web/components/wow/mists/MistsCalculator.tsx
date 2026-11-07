"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { RotateCcw } from "lucide-react";
import { mistsBuildQuery, type MistsBuild } from "@/lib/wow/mists/types";
import styles from "./mists.module.css";

export type CalculatorTalent = { name: string; icon: string; meta: string[]; description: string };
export type CalculatorClass = {
  slug: string;
  color: string;
  specs: { slug: string; name: string; icon: string }[];
  tiers: { level: number; talents: CalculatorTalent[] }[];
};
type Copy = { spec: string; level: string; tiers: string; reset: string };
type Spot = { tier: number; column: number };

function TalentCard({ talent }: { talent: CalculatorTalent }) {
  return <>
    <div className={styles.cardHead}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
      <img src={talent.icon} alt="" width={40} height={40} decoding="async" />
      <h3>{talent.name}</h3>
    </div>
    {talent.meta.length > 0 && <ul className={styles.meta}>{talent.meta.map(line => <li key={line}>{line}</li>)}</ul>}
    <p className={styles.description}>{talent.description}</p>
  </>;
}

/**
 * Mists of Pandaria talents: one choice in each of six tiers. The build lives in the address
 * (`?spec=…&talents=…`), so a copied link opens the same build.
 */
export function MistsCalculator({ cls, initial, copy }: { cls: CalculatorClass; initial: MistsBuild; copy: Copy }) {
  const [build, setBuild] = useState(initial);
  const firstPicked = initial.picks.findIndex(Boolean);
  const [shown, setShown] = useState<Spot>(firstPicked >= 0 ? { tier: firstPicked, column: initial.picks[firstPicked] - 1 } : { tier: 0, column: 0 });

  useEffect(() => {
    const url = `${window.location.pathname}${mistsBuildQuery(build)}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", url);
  }, [build]);

  const pick = (tier: number, column: number) => {
    setShown({ tier, column });
    setBuild(current => ({ ...current, picks: current.picks.map((value, index) => index === tier ? (value === column + 1 ? 0 : column + 1) : value) }));
  };
  const detail = cls.tiers[shown.tier].talents[shown.column];

  return <div className={styles.calculator} style={{ "--class-color": cls.color } as CSSProperties}>
    <div className={styles.specs} role="group" aria-label={copy.spec}>
      {cls.specs.map(spec => <button key={spec.slug} type="button" className={styles.spec} aria-pressed={build.spec === spec.slug}
        onClick={() => setBuild(current => ({ ...current, spec: current.spec === spec.slug ? null : spec.slug }))}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
        <img src={spec.icon} alt="" width={28} height={28} decoding="async" />{spec.name}
      </button>)}
      <button type="button" className={styles.reset} disabled={!build.spec && !build.picks.some(Boolean)}
        onClick={() => setBuild({ spec: null, picks: build.picks.map(() => 0) })}>
        <RotateCcw aria-hidden="true" />{copy.reset}
      </button>
    </div>

    <div className={styles.board}>
      <ol className={styles.tiers} aria-label={copy.tiers}>
        {cls.tiers.map((tier, tierIndex) => <li key={tier.level} className={styles.tier}>
          <div className={styles.tierRow} role="group" aria-label={`${copy.level} ${tier.level}`}>
            <span className={styles.tierLevel} aria-hidden="true">{tier.level}</span>
            {tier.talents.map((talent, column) => {
              const chosen = build.picks[tierIndex] === column + 1;
              return <button key={talent.name} type="button" className={styles.talent} aria-pressed={chosen}
                data-dimmed={build.picks[tierIndex] !== 0 && !chosen || undefined}
                data-shown={shown.tier === tierIndex && shown.column === column || undefined}
                onClick={() => pick(tierIndex, column)}
                onPointerEnter={event => { if (event.pointerType === "mouse") setShown({ tier: tierIndex, column }); }}
                onFocus={() => setShown({ tier: tierIndex, column })}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Blizzard's icon server */}
                <img src={talent.icon} alt="" width={40} height={40} decoding="async" />
                <span>{talent.name}</span>
              </button>;
            })}
          </div>
          {/* Phones: the text opens under its own row instead of a side panel far below. */}
          {shown.tier === tierIndex && <div className={styles.inlineDetail}><TalentCard talent={detail} /></div>}
        </li>)}
      </ol>
      <aside className={styles.detail}><TalentCard talent={detail} /></aside>
    </div>
  </div>;
}
