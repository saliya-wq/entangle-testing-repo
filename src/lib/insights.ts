/* ============================================================
   Insights engine — deterministic "AI-style" commentary.
   Reads a module's KPIs + the client's targets + a trend and
   produces plain-English movers, pacing and trend notes.
   (Seam is ready for a real LLM call later — same signature.)
   ============================================================ */
import type { Target } from "./model";

export type Insight = { kind: "up" | "down" | "info"; text: string };

export function generateInsights(_moduleKey: string, d: any, f: number, targets: Target[] = [], rangeFactor = 1): Insight[] {
  const out: Insight[] = [];
  const kpis: any[] = Array.isArray(d?.kpis) ? d.kpis : [];

  // 1. Biggest good / bad movers by delta
  const scored = kpis.filter((k) => k.d != null).map((k) => ({ k, good: k.good === "down" ? k.dir === "down" : k.dir === "up", mag: Math.abs(k.d) }));
  const gainers = scored.filter((s) => s.good).sort((a, b) => b.mag - a.mag);
  const losers = scored.filter((s) => !s.good).sort((a, b) => b.mag - a.mag);
  if (gainers[0]) out.push({ kind: "up", text: `${gainers[0].k.l} is up ${gainers[0].k.d}% — the strongest mover this period.` });
  if (losers[0] && losers[0].mag >= 3) out.push({ kind: "down", text: `${losers[0].k.l} moved ${losers[0].k.dir === "up" ? "+" : "−"}${losers[0].mag}% the wrong way — worth a look.` });

  // 2. Pacing vs targets (normalised for the selected range)
  for (const t of targets) {
    const k = kpis.find((x) => x.l === t.kpi);
    if (!k || typeof k.v !== "number") continue;
    const actual = k.rate ? k.v : Math.round(k.v * f);
    const target = k.rate ? t.value : Math.round(t.value * rangeFactor);
    if (!target) continue;
    const pct = Math.round((actual / target) * 100);
    const onTrack = t.higherIsBetter ? pct >= 90 : actual <= target;
    out.push({ kind: onTrack ? "up" : "down", text: `${t.kpi}: ${pct}% of the ${t.higherIsBetter ? "" : "≤ "}${t.fmt === "$" ? "$" : ""}${t.value}${t.fmt === "%" ? "%" : t.fmt === "x" ? "x" : ""} target — ${onTrack ? "on track" : "behind pace"}.` });
  }

  // 3. Trend direction (first vs last of whatever series exists)
  const series = d?.trend?.spend || d?.trend?.cost || d?.trend?.answered || d?.trend?.show || d?.spend?.spend || d?.sales?.gross || d?.users?.nw || d?.volume?.gross || d?.reach?.reach;
  if (Array.isArray(series) && series.length > 1 && series[0]) {
    const chg = Math.round(((series[series.length - 1] - series[0]) / series[0]) * 100);
    out.push({ kind: chg >= 0 ? "up" : "down", text: `Trending ${chg >= 0 ? "up" : "down"} ${Math.abs(chg)}% across the window.` });
  }

  return out.slice(0, 4);
}
