"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type LightAreaPoint = { label: string; value: number };

export function LightAreaChart({
  data,
  locale,
  seriesLabel,
  ariaLabel,
  color,
  axisColor,
  gridColor,
  showYAxis = false,
  height = 260,
}: {
  data: LightAreaPoint[];
  locale: string;
  seriesLabel: string;
  ariaLabel: string;
  color: string;
  axisColor: string;
  gridColor: string;
  showYAxis?: boolean;
  height?: number;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const gradientId = `area-chart-${useId().replace(/:/g, "")}`;
  const formatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const top = 18;
  const bottom = height - 36;
  const left = showYAxis ? 42 : 8;
  const right = 8;

  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width);
      if (nextWidth > 0) setWidth((current) => current === nextWidth ? current : nextWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = useMemo(() => {
    const lastIndex = Math.max(1, data.length - 1);
    const maxValue = Math.max(1, ...data.map((point) => point.value));
    const plotWidth = Math.max(1, width - left - right);
    const plotHeight = bottom - top;
    return data.map((point, index) => ({
      ...point,
      x: left + (index / lastIndex) * plotWidth,
      y: bottom - (Math.max(0, point.value) / maxValue) * plotHeight,
    }));
  }, [bottom, data, left, right, top, width]);

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x.toFixed(1)} ${bottom} L${points[0].x.toFixed(1)} ${bottom} Z`
    : "";
  const activePoint = activeIndex === null ? null : points[activeIndex] ?? null;
  const tickStep = Math.max(1, Math.ceil((points.length - 1) / Math.max(1, Math.floor(width / 90) - 1)));
  const maxValue = Math.max(1, ...data.map((point) => point.value));

  return (
    <div
      ref={chartRef}
      className="relative w-full"
      style={{ height }}
      onPointerLeave={() => setActiveIndex(null)}
    >
      <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity="0.42" />
            <stop offset="95%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = top + fraction * (bottom - top);
          return (
            <g key={fraction}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke={gridColor} />
              {showYAxis && <text x={left - 7} y={y + 4} textAnchor="end" fill={axisColor} fontSize="10">{formatter.format(Math.round(maxValue * (1 - fraction)))}</text>}
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {points.map((point, index) => (
          <g
            key={`${point.label}-${index}`}
            role="button"
            tabIndex={0}
            aria-label={`${point.label}: ${seriesLabel} ${formatter.format(point.value)}`}
            aria-describedby={activeIndex === index ? `${gradientId}-tooltip` : undefined}
            onPointerEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
          >
            <circle cx={point.x} cy={point.y} r="10" fill="transparent" />
            {activeIndex === index && <circle cx={point.x} cy={point.y} r="4" fill={color} stroke="#120d07" strokeWidth="2" />}
          </g>
        ))}
        {points.map((point, index) => index % tickStep === 0 || index === points.length - 1 ? (
          <text key={`tick-${point.label}-${index}`} x={point.x} y={bottom + 24} textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill={axisColor} fontSize="11">
            {point.label}
          </text>
        ) : null)}
      </svg>
      {activePoint && (
        <div
          id={`${gradientId}-tooltip`}
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: `${Math.max(8, Math.min(92, (activePoint.x / width) * 100))}%`, top: 8, borderColor: "rgba(255,255,255,.16)", background: "#100d08", color: "#f0dfbf" }}
        >
          <div className="font-medium">{activePoint.label}</div>
          <div className="mt-1 flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{seriesLabel}: {formatter.format(activePoint.value)}</div>
        </div>
      )}
    </div>
  );
}
