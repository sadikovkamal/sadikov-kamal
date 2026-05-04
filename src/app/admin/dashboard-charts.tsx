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

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ef4444",
  "#a855f7",
];

export interface DashboardChartsProps {
  byTopic: Array<{ topicName: string; count: number }>;
  bySource: Array<{ sourceName: string; count: number }>;
  byDifficulty: Array<{ difficulty: number; count: number }>;
}

export function DashboardCharts({
  byTopic,
  bySource,
  byDifficulty,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="Mavzular bo'yicha">
        {byTopic.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={byTopic}
                dataKey="count"
                nameKey="topicName"
                outerRadius={80}
                label={(d: unknown) => {
                  const entry = d as { topicName?: string };
                  return entry.topicName ?? "";
                }}
              >
                {byTopic.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Manbalar bo'yicha">
        {bySource.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={bySource} layout="vertical">
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="sourceName" width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Qiyinlik bo'yicha">
        {byDifficulty.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={byDifficulty}>
              <XAxis dataKey="difficulty" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" />
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
    <div className="border rounded-md p-4">
      <h3 className="font-medium mb-3 text-sm">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
      Ma&apos;lumot yo&apos;q
    </div>
  );
}
