export function RouteLoading({ lang = "en", talent = false }: { lang?: "en" | "ru"; talent?: boolean }) {
  const label = lang === "ru" ? "Загрузка страницы" : "Loading page";
  return (
    <main
      data-talent-route={talent ? "" : undefined}
      role="status"
      aria-live="polite"
      aria-label={label}
      style={{
        display: "grid",
        minHeight: "55svh",
        placeItems: "center",
        color: "#a99a8a",
        font: "12px/1.5 system-ui, sans-serif",
      }}
    >
      {label}…
    </main>
  );
}
