"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { AnalyticsOverview } from "@/lib/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Copy = {
  activity: string;
  empty: string;
  events: string;
  hours: string;
  subscriptions: string;
  users: string;
};

export function AnalyticsDashboard({ data, copy, locale }: { data: AnalyticsOverview; copy: Copy; locale: string }) {
  const number = new Intl.NumberFormat(locale);
  const chartConfig = {
    events: { label: copy.events, color: "var(--gold)" },
    uniqueUsers: { label: copy.users, color: "var(--cyan)" },
  } satisfies ChartConfig;

  const series = data.series.map((point) => ({
    ...point,
    label: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(point.hour)),
  }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          [copy.events, data.events],
          [copy.users, data.uniqueUsers],
          [copy.subscriptions, data.activeSubscriptions],
        ].map(([label, value]) => (
          <Card key={String(label)} className="border-white/10 bg-white/[0.035]">
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="font-display text-3xl text-white">{number.format(Number(value))}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader>
          <CardTitle>{copy.activity}</CardTitle>
          <CardDescription>{copy.hours}</CardDescription>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">{copy.empty}</p>
          ) : (
            <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
              <AreaChart accessibilityLayer data={series} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="events" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-events)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--color-events)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area dataKey="events" type="monotone" fill="url(#events)" stroke="var(--color-events)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
