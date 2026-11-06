import { TalentHero } from "@/components/talents/TalentHero";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { talentCalculatorCopy, type TalentCopyLang } from "@/components/talents/talentCalculatorCopy";
import page from "@/components/talents/talentAtlasPage.module.css";
import bench from "@/components/talents/talentWorkbench.module.css";
import { MaterialPlaque, materialPlaqueStyle } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentCalculatorSkeletonCopy } from "./talentCalculatorSkeletonCopy";

/** Route skeleton: the same hero, toolbar plaque and painted tree panels as the calculator, so nothing jumps. */
export function TalentCalculatorSkeleton({ lang = "ru", theme }: { lang?: TalentCopyLang; theme?: TalentSpecTheme }) {
  const copy = talentCalculatorCopy[lang];
  const loadingLabel = talentCalculatorSkeletonCopy[lang].loadingTheTalentCalculator;
  return (
    <main className={`talent-calculator tc-skeleton ${page.page}`} lang={lang} data-atlas-scope="" data-talent-page="" data-loading-theme="neutral" aria-busy="true" aria-label={loadingLabel}>
      {theme ? <TalentHero theme={theme} lang={lang} /> : null}
      <MaterialPlaque kit={TALENTS_KIT} className={bench.toolbar} aria-hidden="true">
        <div className={bench.pick}><span className="tc-skeleton-block" style={{ width: 180, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 300, height: 44 }} /></div>
        <div className={bench.actions}><span className="tc-skeleton-block" style={{ width: 44, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 44, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 200, height: 44 }} /></div>
      </MaterialPlaque>
      <div className={bench.tabs} aria-hidden="true">{(["class", "hero", "spec"] as const).map((kind) => <button key={kind} type="button" tabIndex={-1} aria-pressed={kind === "class"}><span>{copy.treeTabs[kind]}</span><b>—</b></button>)}</div>
      <section className={`${page.workspace} ${bench.workspace}`} style={materialPlaqueStyle(TALENTS_KIT)}>
        <div className={bench.trees}>
          <TalentTreePanel variant="class" title={copy.treeLabels.class} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
          <TalentTreePanel variant="hero" title={copy.treeLabels.hero} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
          <TalentTreePanel variant="spec" title={copy.treeLabels.spec} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        </div>
      </section>
    </main>
  );
}
