"use client";

import { LightAreaChart } from "@/components/charts/LightAreaChart";

type Point = { hour: string; events: number; label: string };

export function ApiConsoleActivityGraph({ data }: { data: Point[] }) {
  return (
    <div className="min-w-0">
      <LightAreaChart
        data={data.map((point) => ({ label: point.label, value: point.events }))}
        locale="ru"
        seriesLabel="События"
        ariaLabel="Активность API по часам"
        color="#d2ad57"
        axisColor="#667086"
        gridColor="#232938"
        showYAxis
        height={245}
      />
    </div>
  );
}
