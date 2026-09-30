type SkeletonTheme = "platform" | "wow" | "genshin" | "diablo" | "league" | "archive" | "api" | "blueprints";
type SkeletonLayout = "game" | "workspace" | "profile" | "console" | "gallery" | "content";

const copy: Record<SkeletonTheme, string> = {
  platform: "Gildra command center",
  wow: "World of Warcraft intelligence",
  genshin: "Genshin Impact intelligence",
  diablo: "Diablo IV intelligence",
  league: "League of Legends intelligence",
  archive: "Gildra data archive",
  api: "Gildra API console",
  blueprints: "Gildra product atlas",
};

const lines = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => <i key={`${prefix}-${index}`} />);

export function RouteSkeleton({ theme = "platform", layout = "workspace", lang = "en" }: { theme?: SkeletonTheme; layout?: SkeletonLayout; lang?: "en" | "ru" }) {
  return (
    <div className="route-skeleton" data-theme={theme} data-layout={layout} aria-busy="true" aria-label={lang === "ru" ? `Загрузка: ${copy[theme]}` : `Loading ${copy[theme]}`}>
      <header className="route-skeleton-header">
        <strong>GILDRA</strong>
        <nav aria-hidden="true">{lines(4, "nav")}</nav>
        <span />
        <b />
      </header>
      <main>
        <div className="route-skeleton-eyebrow"><i /><span /></div>
        <section className="route-skeleton-hero">
          <div><small /><h1 /><p /><p /><button /></div>
          <aside><i /><i /><i /><i /></aside>
        </section>
        <section className="route-skeleton-grid">
          <article><header /><div>{lines(layout === "console" ? 8 : 5, "primary")}</div></article>
          <aside><header /><div>{lines(layout === "profile" ? 6 : 4, "aside")}</div></aside>
          <article><header /><div>{lines(layout === "gallery" ? 8 : 4, "secondary")}</div></article>
        </section>
      </main>
    </div>
  );
}
