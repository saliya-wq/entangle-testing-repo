/* ============================================================
   Time-series granularity — reshapes trend data between daily,
   weekly, monthly, quarterly and annually. Pure + deterministic.
   Charts opt in via GranularityCtx (see components/charts).
   ============================================================ */
import { AX } from "@/data";

export type Granularity = "daily" | "weekly" | "monthly" | "quarterly" | "annually";

export const GRANULARITIES: { key: Granularity; label: string; short: string }[] = [
  { key: "daily", label: "Daily", short: "D" },
  { key: "weekly", label: "Weekly", short: "W" },
  { key: "monthly", label: "Monthly", short: "M" },
  { key: "quarterly", label: "Quarterly", short: "Q" },
  { key: "annually", label: "Annually", short: "Y" },
];

const COUNT: Record<Granularity, number> = { daily: 14, weekly: 8, monthly: 6, quarterly: 4, annually: 3 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** X-axis labels for each granularity, anchored to Aug 2026 (the sample "now"). */
export function granularityLabels(g: Granularity): string[] {
  const n = COUNT[g];
  if (g === "weekly") return AX; // preserve the current 8-point look
  if (g === "daily") {
    const end = new Date(2026, 7, 5); // 5 Aug 2026
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(end);
      d.setDate(end.getDate() - (n - 1 - i));
      return d.getDate() + " " + MONTHS[d.getMonth()];
    });
  }
  if (g === "monthly") return MONTHS.slice(2, 2 + n); // Mar..Aug
  if (g === "quarterly") return ["Q3 25", "Q4 25", "Q1 26", "Q2 26"].slice(-n);
  return ["2024", "2025", "2026"].slice(-n); // annually
}

/** Piecewise-linear resample of a series to `target` points (preserves shape + endpoints). */
export function resample(values: number[], target: number): number[] {
  const b = values.length;
  if (b === 0 || target <= 0) return [];
  if (b === 1) return Array(target).fill(values[0]);
  if (target === 1) return [values[b - 1]];
  return Array.from({ length: target }, (_, k) => {
    const pos = (k / (target - 1)) * (b - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos), t = pos - lo;
    return Math.round(values[lo] + (values[hi] - values[lo]) * t);
  });
}

// Weekday seasonality (Mon…Sun) applied at DAILY granularity so the fine view
// shows realistic weekend dips — otherwise interpolation preserves the line's
// shape and coarser views look identical apart from the x-axis labels.
const DOW = [1.04, 1.08, 1.06, 1.05, 1.02, 0.82, 0.78];

/** Transform trend series to the given granularity (new labels + resampled data).
    At daily granularity, adds a deterministic weekday pattern for visible detail. */
export function applyGranularity(series: { name: string; data: number[] }[], g: Granularity) {
  const labels = granularityLabels(g);
  const n = labels.length;
  return {
    labels,
    series: series.map((s) => {
      let data = resample(s.data, n);
      if (g === "daily") data = data.map((v, i) => Math.round(v * DOW[i % 7]));
      return { name: s.name, data };
    }),
  };
}
