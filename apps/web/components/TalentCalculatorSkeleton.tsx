import { TalentTreePanel } from "@/components/talents/TalentTreePanel";
import { talentCalculatorCopy, type TalentCopyLang } from "@/components/talents/talentCalculatorCopy";
import { talentCalculatorSkeletonCopy } from "./talentCalculatorSkeletonCopy";

/** Neutral route skeleton: same page toolbar and tree frames as the calculator, no second site header. */
export function TalentCalculatorSkeleton({ lang = "ru" }: { lang?: TalentCopyLang }) {
  const copy = talentCalculatorCopy[lang];
  const loadingLabel = talentCalculatorSkeletonCopy[lang].loadingTheTalentCalculator;
  return (
    <main className="talent-calculator tc-skeleton" lang={lang} data-atlas-scope="" data-loading-theme="neutral" aria-busy="true" aria-label={loadingLabel}>
      <section className="tc-commandbar" aria-hidden="true">
        <div className="tc-page-title"><span className="tc-fury-portrait tc-skeleton-block" /><div><span className="tc-skeleton-block" style={{ width: 178, height: 12 }} /><span className="tc-skeleton-block" style={{ width: 238, height: 22, marginTop: 6 }} /><span className="tc-skeleton-block" style={{ width: 286, height: 11, marginTop: 6 }} /></div></div>
        <div className="tc-command-actions"><span className="tc-skeleton-block" style={{ width: 190, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 150, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 220, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 196, height: 44 }} /></div>
      </section>
      <div className="tc-mobile-tree-switcher" aria-hidden="true"><button type="button" tabIndex={-1}>{copy.treeTabs.class}</button><button type="button" tabIndex={-1}>{copy.treeTabs.hero}</button><button type="button" tabIndex={-1}>{copy.treeTabs.spec}</button></div>
      <section className="tc-workspace" data-mobile-tree="class">
        <TalentTreePanel lang={lang} variant="class" eyebrow={copy.treeEyebrows.class} title={copy.treeLabels.class} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel lang={lang} variant="hero" eyebrow={copy.treeEyebrows.hero} title={copy.treeLabels.hero} secondary={<span className="tc-skeleton-block tc-skeleton-path" />} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel lang={lang} variant="spec" eyebrow={copy.treeEyebrows.spec} title={copy.treeLabels.spec} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
      </section>
      <footer className="tc-toolbar" aria-hidden="true"><div className="tc-skeleton-block" style={{ width: 280, height: 44 }} /><div className="tc-toolbar-spacer" /><div className="tc-skeleton-block" style={{ width: 196, height: 50 }} /><div className="tc-skeleton-block" style={{ width: 210, height: 50 }} /></footer>
    </main>
  );
}
