import { TalentHero } from "@/components/talents/TalentHero";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { talentCalculatorCopy, type TalentCopyLang } from "@/components/talents/talentCalculatorCopy";
import page from "@/components/talents/talentAtlasPage.module.css";
import { MaterialPlaque, materialPlaqueStyle } from "@/components/wow/shared/materialAtlas";
import { TALENTS_KIT } from "@/lib/wow/charactersKit";
import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import { talentCalculatorSkeletonCopy } from "./talentCalculatorSkeletonCopy";

/** Route skeleton: the same hero, command plaque and painted tree panels as the calculator, no second site header. */
export function TalentCalculatorSkeleton({ lang = "ru", theme }: { lang?: TalentCopyLang; theme?: TalentSpecTheme }) {
  const copy = talentCalculatorCopy[lang];
  const loadingLabel = talentCalculatorSkeletonCopy[lang].loadingTheTalentCalculator;
  return (
    <main className={`talent-calculator tc-skeleton ${page.page}`} lang={lang} data-atlas-scope="" data-talent-page="" data-loading-theme="neutral" aria-busy="true" aria-label={loadingLabel}>
      {theme ? <TalentHero theme={theme} lang={lang} /> : null}
      <MaterialPlaque kit={TALENTS_KIT} className={page.command} aria-hidden="true">
        <div className="tc-command-actions"><span className="tc-skeleton-block" style={{ width: 190, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 176, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 228, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 96, height: 44 }} /></div>
      </MaterialPlaque>
      <div className="tc-mobile-tree-switcher" aria-hidden="true"><button type="button" tabIndex={-1}>{copy.treeTabs.class}</button><button type="button" tabIndex={-1}>{copy.treeTabs.hero}</button><button type="button" tabIndex={-1}>{copy.treeTabs.spec}</button></div>
      <section className={`tc-workspace ${page.workspace}`} data-mobile-tree="class" style={materialPlaqueStyle(TALENTS_KIT)}>
        <TalentTreePanel lang={lang} variant="class" eyebrow={copy.treeEyebrows.class} title={copy.treeLabels.class} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel lang={lang} variant="hero" eyebrow={copy.treeEyebrows.hero} title={copy.treeLabels.hero} secondary={<span className="tc-skeleton-block tc-skeleton-path" />} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel lang={lang} variant="spec" eyebrow={copy.treeEyebrows.spec} title={copy.treeLabels.spec} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
      </section>
      <footer className="tc-toolbar" aria-hidden="true"><div className="tc-skeleton-block" style={{ width: 280, height: 44 }} /><div className="tc-toolbar-spacer" /><div className="tc-skeleton-block" style={{ width: 196, height: 50 }} /><div className="tc-skeleton-block" style={{ width: 240, height: 68 }} /></footer>
    </main>
  );
}
