import styles from "./stats.module.css";

export type ChartSeries = { key: string; label: string; tone: 0 | 1 | 2 | 3 | 4; points: Array<[string, number]> };

type Frame = { width: number; height: number; pad: { top: number; right: number; bottom: number; left: number } };
/** Two drawings of one chart, swapped by CSS: text in an SVG scales with it, so a phone gets its own frame. */
const frames: Record<"wide" | "narrow", Frame> = {
  wide: { width: 500, height: 200, pad: { top: 10, right: 84, bottom: 24, left: 42 } },
  narrow: { width: 320, height: 210, pad: { top: 12, right: 80, bottom: 24, left: 40 } },
};

/**
 * Rating cutoffs over the season: one line per series, server-rendered SVG
 * (no chart library). Lines carry their own end labels instead of a legend;
 * the numbers stay readable as the table above the chart.
 */
export function CutoffChart({ series, label, locale }: { series: ChartSeries[]; label: string; locale: "en" | "ru" }) {
  // The first days of a season have almost nobody rated, so a cutoff starts near zero; the chart
  // begins on the first day every line has reached half of its current value.
  const start = series.reduce((day, item) => {
    const last = item.points[item.points.length - 1]?.[1] ?? 0;
    const first = item.points.find(([, value]) => value >= last / 2)?.[0];
    return first && first > day ? first : day;
  }, "");
  const lines = series.map((item) => ({ ...item, points: item.points.filter(([day]) => day >= start) })).filter((item) => item.points.length > 1);
  if (!lines.length) return null;
  return (
    <figure className={styles.chart}>
      <Drawing frame={frames.wide} lines={lines} label={label} locale={locale} className={styles.chartWide} />
      <Drawing frame={frames.narrow} lines={lines} label={label} locale={locale} className={styles.chartNarrow} />
    </figure>
  );
}

function Drawing({ frame, lines, label, locale, className }: { frame: Frame; lines: ChartSeries[]; label: string; locale: "en" | "ru"; className: string }) {
  const { width, height, pad } = frame;
  const days = lines.flatMap((item) => item.points.map(([day]) => Date.parse(`${day}T00:00:00Z`)));
  const values = lines.flatMap((item) => item.points.map(([, value]) => value));
  const x0 = Math.min(...days);
  const x1 = Math.max(...days);
  const step = niceStep((Math.max(...values) - Math.min(...values)) / 4);
  const y0 = Math.floor(Math.min(...values) / step) * step;
  const y1 = Math.ceil(Math.max(...values) / step) * step;
  const x = (day: string) => pad.left + ((Date.parse(`${day}T00:00:00Z`) - x0) / Math.max(1, x1 - x0)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - y0) / Math.max(1, y1 - y0)) * (height - pad.top - pad.bottom);
  const ticks: number[] = [];
  for (let value = y0; value <= y1 + 0.001; value += step) ticks.push(value);
  const months = monthTicks(x0, x1);
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
  const fmt = (value: number) => Math.round(value).toLocaleString(locale);
  // End labels: keep at least 14 px apart so close lines stay readable.
  const ends = lines
    .map((item) => ({ item, value: item.points[item.points.length - 1][1] }))
    .sort((a, b) => b.value - a.value)
    .map((end) => ({ ...end, y: y(end.value) }));
  for (let index = 1; index < ends.length; index += 1) ends[index].y = Math.max(ends[index].y, ends[index - 1].y + 14);
  return (
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={`${styles.chartSvg} ${className}`}>
        {ticks.map((tick) => (
          <g key={tick} className={styles.chartGrid}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
            <text x={pad.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">{fmt(tick)}</text>
          </g>
        ))}
        {months.map((tick) => (
          <text key={tick} className={styles.chartAxis} x={pad.left + ((tick - x0) / Math.max(1, x1 - x0)) * (width - pad.left - pad.right)} y={height - 8} textAnchor="middle">{month.format(tick)}</text>
        ))}
        {lines.map((item) => (
          <polyline key={item.key} className={styles.chartLine} data-tone={item.tone} points={item.points.map(([day, value]) => `${x(day).toFixed(1)},${y(value).toFixed(1)}`).join(" ")} />
        ))}
        {ends.map(({ item, value, y: labelY }) => (
          <g key={item.key} className={styles.chartEnd} data-tone={item.tone}>
            <circle cx={x(item.points[item.points.length - 1][0])} cy={y(value)} r="3.5" />
            <text x={width - pad.right + 10} y={labelY} dy="0.32em">{item.label} · {fmt(value)}</text>
          </g>
        ))}
      </svg>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 50;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

function monthTicks(from: number, to: number) {
  const ticks: number[] = [];
  const start = new Date(from);
  let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  while (cursor <= to) {
    ticks.push(cursor);
    const date = new Date(cursor);
    cursor = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return ticks;
}
