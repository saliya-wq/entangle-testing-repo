/* Client seam for the server-side Claude insights (/api/insights).
   Returns null on any error/timeout so the caller keeps the deterministic
   rules-engine output (src/lib/insights.ts) as an instant fallback. */
import type { Insight } from "./insights";
import type { Target } from "./model";

export interface AiInsightPayload {
  moduleLabel: string;
  rangeLabel: string;
  currency: string;
  kpis: unknown[];
  targets: Target[];
  trend: { name: string; first: number; last: number } | null;
}

export async function fetchAiInsights(payload: AiInsightPayload, timeoutMs = 12000): Promise<Insight[] | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const data = await r.json();
    const arr = Array.isArray(data?.insights) ? data.insights : null;
    if (!arr || !arr.length) return null;
    return arr
      .filter((i: any) => i && typeof i.text === "string")
      .map((i: any) => ({ kind: i.kind === "up" || i.kind === "down" ? i.kind : "info", text: i.text }));
  } catch {
    return null;
  }
}
