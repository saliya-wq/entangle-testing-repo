/* ============================================================
   Multi-touch attribution engine.
   Distributes each conversion's revenue across the channels in its
   journey according to the selected model. Pure + side-effect-free
   so the same functions run over BigQuery touchpoint paths later.

   Models:
     first   — 100% credit to the first touchpoint
     last    — 100% credit to the last touchpoint
     linear  — equal credit across all touchpoints
     decay   — more credit nearer the conversion (7-day half-life)

   Because every model's per-path weights sum to 1, the TOTAL
   attributed revenue is identical across models (== total revenue) —
   only the split between channels changes.
   ============================================================ */

export type AttrModel = "first" | "last" | "linear" | "decay";

export const ATTR_MODELS: { key: AttrModel; label: string; desc: string }[] = [
  { key: "first", label: "First Click", desc: "100% credit to the first touchpoint" },
  { key: "last", label: "Last Click", desc: "100% credit to the last (converting) touchpoint" },
  { key: "linear", label: "Linear", desc: "Credit split equally across every touchpoint" },
  { key: "decay", label: "Time Decay", desc: "More credit to touches nearer the conversion (7-day half-life)" },
];

/** A grouped conversion journey: an ordered list of channel touchpoints,
    how many conversions followed it, and the total revenue they produced. */
export interface Path { path: string[]; conv: number; rev: number }

export interface ChannelAttr { channel: string; revenue: number; conversions: number }

const SPACING_DAYS = 3; // assumed gap between touches (for time-decay)
const HALF_LIFE = 7;    // days

/** Credit weights for an n-touch path under a model (always sum to 1). */
export function modelWeights(n: number, model: AttrModel): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (model === "first") return [1, ...Array(n - 1).fill(0)];
  if (model === "last") return [...Array(n - 1).fill(0), 1];
  if (model === "linear") return Array(n).fill(1 / n);
  // decay: last touch at day 0, each earlier touch SPACING_DAYS further back
  const raw = Array.from({ length: n }, (_, i) => Math.pow(2, -((n - 1 - i) * SPACING_DAYS) / HALF_LIFE));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / s);
}

/** Attributed revenue + conversions per channel under one model, sorted desc. */
export function attribute(paths: Path[], model: AttrModel): ChannelAttr[] {
  const rev: Record<string, number> = {};
  const conv: Record<string, number> = {};
  for (const p of paths) {
    const w = modelWeights(p.path.length, model);
    p.path.forEach((ch, i) => {
      rev[ch] = (rev[ch] || 0) + p.rev * w[i];
      conv[ch] = (conv[ch] || 0) + p.conv * w[i];
    });
  }
  return Object.keys(rev)
    .map((ch) => ({ channel: ch, revenue: Math.round(rev[ch]), conversions: Math.round(conv[ch]) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Attributed revenue per channel across ALL models — for the comparison table. */
export function attributeAll(paths: Path[]): Record<string, Record<AttrModel, number>> {
  const out: Record<string, Record<AttrModel, number>> = {};
  for (const m of ATTR_MODELS) {
    for (const c of attribute(paths, m.key)) {
      (out[c.channel] ||= { first: 0, last: 0, linear: 0, decay: 0 })[m.key] = c.revenue;
    }
  }
  return out;
}
