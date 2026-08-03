export const CHART = ["#6366f1", "#14b8a6", "#f59e0b", "#f43f5e", "#8b5cf6", "#22c55e"];

/* Resolve the active theme's chart palette from CSS variables (re-read on every render,
   so charts recolour when the theme changes). Falls back to the static palette. */
export function chartColors(): string[] {
  if (typeof window === "undefined") return CHART;
  const s = getComputedStyle(document.documentElement);
  const read = (n: string) => { const v = s.getPropertyValue(n).trim(); return v ? `hsl(${v})` : ""; };
  const arr = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"].map(read).filter(Boolean);
  return arr.length === 6 ? arr : CHART;
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-AU");
export const fmtMoney = (n: number) =>
  n >= 1000 ? "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "K" : "$" + Math.round(n);
export const fmtCompact = (n: number) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n);

export function fmtVal(v: number | string, f?: string): string {
  const n = Number(v);
  switch (f) {
    case "$": return fmtMoney(n);
    case "$2": return "$" + n.toFixed(2);
    case "c": return fmtCompact(n);
    case "n": return fmtNum(n);
    case "%": return (n < 10 ? n.toFixed(1) : Math.round(n)) + "%";
    case "x": return n.toFixed(1) + "x";
    case "min": return n.toFixed(1) + "m";
    case "mo": return n.toFixed(1) + "mo";
    case "d1": return n.toFixed(1);
    case "sec": return Math.round(n) + "s";
    case "day": return Math.round(n) + "d";
    default: return String(v);
  }
}

export const scale = (v: number, f: number, rate?: boolean) => (rate ? v : Math.round(v * f));
export const A = (arr: number[], f: number) => arr.map((x) => Math.round(x * f));
export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
