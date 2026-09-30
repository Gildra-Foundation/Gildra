export function AppSkeleton({ variant = "home" }: { variant?: "home" | "tier" }) {
  return (
    <div className={`loading-shell loading-${variant}`} aria-busy="true" aria-label="Loading Gildra">
      <div className="loading-top">
        <span className="loading-brand" />
        <span className="loading-control loading-wide" />
        <span className="loading-control loading-small" />
        <span className="loading-spacer" />
        <span className="loading-control loading-search" />
        <span className="loading-dot" />
      </div>
      {variant === "home" ? (
        <>
          <div className="loading-hero">
            <span className="loading-line loading-kicker" />
            <span className="loading-line loading-title" />
            <span className="loading-line loading-title short" />
            <span className="loading-line loading-copy" />
            <span className="loading-button" />
          </div>
          <div className="loading-body">
            <div className="loading-strip" />
            <div className="loading-actions"><span /><span /><span /><span /></div>
            <div className="loading-columns"><span /><span /></div>
          </div>
        </>
      ) : (
        <div className="loading-tier">
          <span className="loading-line loading-breadcrumb" />
          <span className="loading-line loading-tier-title" />
          <div className="loading-tabs"><span /><span /><span /><span /></div>
          <div className="loading-tier-layout"><span className="loading-rail" /><span className="loading-table" /><span className="loading-detail" /></div>
        </div>
      )}
    </div>
  );
}
