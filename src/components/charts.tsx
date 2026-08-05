import {
  ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { createContext, useContext } from "react";
import { chartColors, fmtVal, scale } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { applyGranularity, type Granularity } from "@/lib/timeseries";

/* Trend charts read the active granularity from here; the Portal provides it. */
export const GranularityCtx = createContext<Granularity>("weekly");
export const GranularityProvider = GranularityCtx.Provider;

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } };
const grid = { stroke: "hsl(var(--border))", strokeDasharray: "3 3" };

/* ---------- KPI ---------- */
export interface Kpi { l: string; v: number | string; fmt?: string; d?: number; dir?: string; good?: string; rate?: boolean; hero?: boolean }

// Literal class map so Tailwind's JIT keeps these; interpolated names would be purged.
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3",
  4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6",
};
/** Pick the column count that leaves the fewest empty cells in the last row
    (densest wins on ties) so KPI grids stay balanced for 6/8/9-card modules. */
function balancedCols(n: number): string {
  const cols = n <= 4 ? n : [6, 5, 4].map((c) => ({ c, e: (c - (n % c)) % c })).sort((a, b) => a.e - b.e || b.c - a.c)[0].c;
  return LG_COLS[cols] || "lg:grid-cols-6";
}

export function KpiRow({ items, f }: { items: Kpi[]; f: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", balancedCols(items.length))}>
      {items.map((k, i) => {
        const up = k.good === "down" ? k.dir === "down" : k.dir === "up";
        return (
          <div key={i} className={cn("rounded-xl border p-4 shadow-sm", k.hero ? "border-transparent bg-gradient-to-br from-primary to-[hsl(var(--chart-2))] text-white" : "bg-card")}>
            <div className={cn("text-xs font-medium", k.hero ? "text-white/85" : "text-muted-foreground")}>{k.l}</div>
            <div className="mt-1.5 text-2xl font-bold tracking-tight">{fmtVal(typeof k.v === "number" ? scale(k.v, f, k.rate) : k.v, k.fmt)}</div>
            {k.d != null && (
              <div className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", k.hero ? "bg-white/20 text-white" : up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                {k.dir === "up" ? "▲" : "▼"} {Math.abs(k.d)}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Tooltip ---------- */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label != null && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-5 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
            {p.name}
          </span>
          <span className="font-mono tabular-nums text-foreground">{typeof p.value === "number" ? p.value.toLocaleString("en-AU") : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Card wrapper + legend ---------- */
export function ChartCard({ title, desc, legend, children }: { title: string; desc?: string; legend?: string[]; children: React.ReactNode }) {
  const C = chartColors();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-[15px]">{title}</CardTitle>
          {desc && <CardDescription className="mt-0.5 text-xs">{desc}</CardDescription>}
        </div>
        {legend && (
          <div className="flex flex-wrap gap-3">
            {legend.map((l, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C[i] }} />{l}
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ---------- Trend (Area for series 0, Line for series 1; optional dual axis) ---------- */
export function TrendChart({ labels, series, dual, height = 260 }: { labels: string[]; series: { name: string; data: number[] }[]; dual?: boolean; height?: number }) {
  const C = chartColors();
  const g = useContext(GranularityCtx);
  const t = g === "weekly" ? { labels, series } : applyGranularity(series, g);
  const rows = t.labels.map((l, i) => { const o: any = { name: l }; t.series.forEach((s, si) => (o["s" + si] = s.data[i])); return o; });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ left: -12, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="grad0" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={C[0]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} {...grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis yAxisId="left" {...axis} />
        {dual && <YAxis yAxisId="right" orientation="right" {...axis} />}
        <Tooltip content={<ChartTip />} />
        <Area yAxisId="left" type="monotone" dataKey="s0" name={series[0].name} stroke={C[0]} fill="url(#grad0)" strokeWidth={2.5} dot={false} />
        {series[1] && (
          <Line yAxisId={dual ? "right" : "left"} type="monotone" dataKey="s1" name={series[1].name} stroke={C[1]} strokeWidth={2.5} dot={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ---------- Horizontal bar ---------- */
export function BarH({ labels, data, color, height = 240 }: { labels: string[]; data: number[]; color?: string; height?: number }) {
  const C = chartColors();
  const rows = labels.map((l, i) => ({ name: l, v: data[i] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 12 }}>
        <CartesianGrid horizontal={false} {...grid} />
        <XAxis type="number" {...axis} />
        <YAxis type="category" dataKey="name" width={128} {...axis} />
        <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTip />} />
        <Bar dataKey="v" name="Value" fill={color || C[0]} radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Grouped vertical bar ---------- */
export function GroupBar({ labels, groups, height = 260 }: { labels: string[]; groups: { name: string; data: number[] }[]; height?: number }) {
  const C = chartColors();
  const rows = labels.map((l, i) => { const o: any = { name: l }; groups.forEach((g, gi) => (o["g" + gi] = g.data[i])); return o; });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ left: -12, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} {...grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} />
        <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={<ChartTip />} />
        {groups.map((g, i) => <Bar key={i} dataKey={"g" + i} name={g.name} fill={C[i]} radius={[4, 4, 0, 0]} maxBarSize={22} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Donut ---------- */
export function Donut({ labels, data, height = 240 }: { labels: string[]; data: number[]; height?: number }) {
  const C = chartColors();
  const rows = labels.map((l, i) => ({ name: l, value: data[i] }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
          {rows.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}
        </Pie>
        <Tooltip content={<ChartTip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DonutLegend({ labels, data, money }: { labels: string[]; data: number[]; money?: boolean }) {
  const C = chartColors();
  const total = data.reduce((a, b) => a + b, 0);
  return (
    <div className="mt-3 space-y-2">
      {labels.map((l, i) => (
        <div key={i} className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: C[i % C.length] }} />
          <span className="text-muted-foreground">{l}</span>
          <span className="ml-auto font-medium tabular-nums">
            {money ? "$" + data[i].toLocaleString("en-AU") : Math.round((data[i] / total) * 100) + "%"}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- shared layout helpers ---------- */
export function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}
export function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[15px]">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
export const num = (className = "") => "text-right tabular-nums " + className;
