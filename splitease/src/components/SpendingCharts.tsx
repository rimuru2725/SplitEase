"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Tag } from "lucide-react";

interface Expense {
  id: number;
  amount: number;
  category: string;
  created_at: string;
}

const CATEGORY_PALETTE: Record<string, string> = {
  Food: "#f59e0b",
  Travel: "#38bdf8",
  Rent: "#a78bfa",
  Utilities: "#34d399",
  Shopping: "#fb7185",
  Entertainment: "#818cf8",
  Others: "#94a3b8",
};

const CATEGORIES = ["Food", "Travel", "Rent", "Utilities", "Shopping", "Entertainment", "Others"];

interface SpendingChartsProps {
  expenses: Expense[];
}

export default function SpendingCharts({ expenses }: SpendingChartsProps) {
  // Category donut data
  const categoryData = (() => {
    const totals: Record<string, number> = {};
    CATEGORIES.forEach((c) => (totals[c] = 0));

    expenses.forEach((e) => {
      const cat = e.category || "Others";
      if (totals[cat] !== undefined) {
        totals[cat] += Number(e.amount);
      } else {
        totals["Others"] += Number(e.amount);
      }
    });

    return Object.entries(totals)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .sort((a, b) => b.value - a.value);
  })();

  // Timeline area data (group by day)
  const timelineData = (() => {
    const byDay: Record<string, number> = {};
    expenses.forEach((e) => {
      const day = new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      byDay[day] = (byDay[day] || 0) + Number(e.amount);
    });
    return Object.entries(byDay)
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
      .slice(-14); // last 14 days
  })();

  const totalSpending = categoryData.reduce((s, c) => s + c.value, 0);

  if (expenses.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
          <Tag className="w-7 h-7 text-slate-500" />
        </div>
        <p className="text-sm text-slate-500 font-medium">No expenses logged yet.</p>
        <p className="text-xs text-slate-600 mt-1">Charts will appear once you add expenses.</p>
      </div>
    );
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-elevated rounded-xl px-4 py-3 text-xs">
          <p className="font-bold text-indigo-300 mb-1">{payload[0].name || payload[0]?.payload?.date}</p>
          <p className="text-slate-300 font-mono font-bold">${payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy }: any) => {
    return (
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
        <tspan x={cx} dy="-8" className="fill-slate-400 text-[10px] font-semibold">
          TOTAL
        </tspan>
        <tspan x={cx} dy="20" className="fill-white text-lg font-black font-mono">
          ${totalSpending.toFixed(0)}
        </tspan>
      </text>
    );
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Donut Chart */}
      <div className="flex flex-col">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          By Category
        </h4>
        <div className="flex-1 flex items-center justify-center min-h-[220px]">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
                labelLine={false}
                label={renderCustomLabel}
                animationBegin={0}
                animationDuration={1200}
                animationEasing="ease-out"
              >
                {categoryData.map((entry) => (
                  <Cell key={entry.name} fill={CATEGORY_PALETTE[entry.name] || CATEGORY_PALETTE.Others} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 justify-center">
          {categoryData.map((cat) => (
            <div key={cat.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: CATEGORY_PALETTE[cat.name] || CATEGORY_PALETTE.Others }}
              />
              <span className="text-slate-400 font-medium">{cat.name}</span>
              <span className="text-slate-500 font-mono">${cat.value.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Area Chart — Spending Timeline */}
      <div className="flex flex-col">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
          Spending Timeline
        </h4>
        <div className="flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(100,100,180,0.08)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "rgba(100,100,180,0.1)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="amount"
                stroke="#818cf8"
                strokeWidth={2}
                fill="url(#areaGradient)"
                animationDuration={1500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
