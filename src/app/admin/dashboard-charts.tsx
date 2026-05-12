"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Neutral chart ramp + indigo accent for highest bar. Keeps analytical
// surfaces calm; the indigo carries the brand.
const NEUTRAL_RAMP = [
  "oklch(0.87 0 0)",
  "oklch(0.78 0 0)",
  "oklch(0.68 0 0)",
  "oklch(0.58 0 0)",
  "oklch(0.48 0 0)",
  "oklch(0.4 0 0)",
  "oklch(0.32 0 0)",
  "oklch(0.24 0 0)",
];
const ACCENT = "oklch(0.52 0.18 264)";

export interface DashboardChartsProps {
  byTopic: Array<{ topicName: string; count: number }>;
  bySource: Array<{ sourceName: string; count: number }>;
}

export function DashboardCharts({ byTopic, bySource }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <ChartCard title="Mavzular bo'yicha">
        {byTopic.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={byTopic}
                dataKey="count"
                nameKey="topicName"
                outerRadius={70}
                innerRadius={36}
                strokeWidth={0}
              >
                {byTopic.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === 0 ? ACCENT : NEUTRAL_RAMP[i % NEUTRAL_RAMP.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: "12px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.92 0 0)",
                  padding: "6px 10px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Manbalar bo'yicha">
        {bySource.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={bySource}
              layout="vertical"
              margin={{ left: 0, right: 12, top: 4, bottom: 4 }}
            >
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "oklch(0.556 0 0)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="sourceName"
                width={110}
                tick={{ fontSize: 11, fill: "oklch(0.4 0 0)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "oklch(0.97 0 0)" }}
                contentStyle={{
                  fontSize: "12px",
                  borderRadius: "8px",
                  border: "1px solid oklch(0.92 0 0)",
                  padding: "6px 10px",
                }}
              />
              <Bar dataKey="count" fill={ACCENT} radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      </div>
      <div className="px-2 pb-2">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-[220px] text-xs text-muted-foreground">
      Ma&apos;lumot yo&apos;q
    </div>
  );
}
