"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ACCENT = "oklch(0.52 0.18 264)";

export interface ActivitySeries {
  day: string; // YYYY-MM-DD
  count: number;
}

/**
 * Daily activity over a fixed window (typically 30 days). The X axis
 * shows abbreviated month-day labels at sparse intervals so the chart
 * stays readable on narrow widths.
 */
export function ActivityChart({ series }: { series: ActivitySeries[] }) {
  if (series.length === 0 || series.every((d) => d.count === 0)) {
    return (
      <div className="flex items-center justify-center h-[140px] text-xs text-muted-foreground">
        Bu davrda masala qo&apos;shilmagan
      </div>
    );
  }
  const tickEvery = Math.ceil(series.length / 6);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart
        data={series}
        margin={{ left: 0, right: 4, top: 4, bottom: 0 }}
      >
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: "oklch(0.556 0 0)" }}
          axisLine={false}
          tickLine={false}
          interval={tickEvery - 1}
          tickFormatter={(d: string) => {
            const [, m, day] = d.split("-");
            return `${Number(day)}/${Number(m)}`;
          }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "oklch(0.556 0 0)" }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip
          cursor={{ stroke: "oklch(0.85 0 0)", strokeDasharray: "3 3" }}
          contentStyle={{
            fontSize: "11px",
            borderRadius: "8px",
            border: "1px solid oklch(0.92 0 0)",
            padding: "4px 8px",
          }}
          labelFormatter={(label) => {
            const d = typeof label === "string" ? label : String(label ?? "");
            const date = new Date(d);
            return Number.isNaN(date.getTime())
              ? d
              : date.toLocaleDateString("uz-UZ", {
                  day: "numeric",
                  month: "long",
                });
          }}
          formatter={(value) => [`${Number(value)} ta`, "Qo'shildi"]}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke={ACCENT}
          strokeWidth={1.75}
          fill="url(#activityFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
