import type { CSSProperties } from "react";
import { TalentTreePanel } from "@/components/talents/TalentTreePanel";

const skeletonStyle = {
  "--tc-accent": "#8d9aa4",
  "--tc-hot": "#d8e0e5",
  "--tc-deep": "#172027",
  "--tc-accent-rgb": "141,154,164",
  "--tc-hot-rgb": "216,224,229",
  "--tc-ambient-rgb": "55,67,76",
  "--tc-panel-rgb": "90,103,112",
  "--tc-panel-hot": "190,201,208",
} as CSSProperties;

export function TalentCalculatorSkeleton() {
  return (
    <main className="talent-calculator tc-skeleton" data-loading-theme="neutral" style={skeletonStyle} aria-busy="true" aria-label="Загрузка калькулятора талантов">
      <header className="tc-header">
        <span className="tc-brand-lockup">GILDRA</span>
        <span className="tc-skeleton-block" style={{ width: 198, height: 38 }} />
        <span className="tc-skeleton-block" style={{ width: 330, height: 16 }} />
      </header>
      <section className="tc-commandbar">
        <div className="tc-page-title"><span className="tc-fury-portrait tc-skeleton-block" /><div><span className="tc-skeleton-block" style={{ width: 178, height: 12 }} /><span className="tc-skeleton-block" style={{ width: 238, height: 20, marginTop: 5 }} /><span className="tc-skeleton-block" style={{ width: 286, height: 9, marginTop: 6 }} /></div></div>
        <div className="tc-command-actions"><span className="tc-skeleton-block" style={{ width: 126, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 258, height: 44 }} /><span className="tc-skeleton-block" style={{ width: 330, height: 44 }} /></div>
      </section>
      <div className="tc-mobile-tree-switcher"><button type="button">Класс</button><button type="button">Путь героя</button><button type="button">Специализация</button></div>
      <section className="tc-workspace">
        <TalentTreePanel variant="class" eyebrow="Основа класса" title="Дерево класса" spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel variant="hero" eyebrow="Путь героя" title="Героическое дерево" secondary={<span className="tc-skeleton-block tc-skeleton-path" />} spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
        <TalentTreePanel variant="spec" eyebrow="Специализация" title="Дерево специализации" spent={0} budget={0} nodeCount={0} loading><div className="tc-skeleton-tree" /></TalentTreePanel>
      </section>
      <footer className="tc-toolbar"><div className="tc-skeleton-block" style={{ width: 245, height: 47 }} /><div className="tc-skeleton-block" style={{ width: 158, height: 47 }} /><div className="tc-toolbar-spacer" /><div className="tc-skeleton-block" style={{ width: 195, height: 48 }} /></footer>
    </main>
  );
}
