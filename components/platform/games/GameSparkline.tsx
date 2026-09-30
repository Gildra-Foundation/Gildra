import styles from "./gameHub.module.css";

export function GameSparkline({ values, accent }: { values: number[]; accent: string }) {
  const width = 620;
  const height = 150;
  const safeValues = values.length > 1 ? values : [0, 0];
  const min = Math.min(...safeValues);
  const max = Math.max(...safeValues);
  const range = max - min || 1;
  const points = safeValues.map((value, index) => ({
    x: 8 + index * ((width - 16) / (safeValues.length - 1)),
    y: height - 12 - ((value - min) / range) * (height - 30),
  }));
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `8,${height - 8} ${line} ${width - 8},${height - 8}`;

  return (
    <svg className={styles.signalChart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Meta trend">
      <defs>
        <linearGradient id="game-hub-signal-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity=".3" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className={styles.chartGrid} aria-hidden="true"><line x1="8" x2="612" y1="35" y2="35" /><line x1="8" x2="612" y1="78" y2="78" /><line x1="8" x2="612" y1="121" y2="121" /></g>
      <polygon points={area} fill="url(#game-hub-signal-fill)" />
      <polyline className={styles.chartLine} pathLength="1" points={line} fill="none" stroke={accent} />
      {points.map(({ x, y }, index) => <circle key={`${x}-${index}`} cx={x} cy={y} r={index === points.length - 1 ? 5 : 3} fill={accent} />)}
    </svg>
  );
}
