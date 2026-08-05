import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { RANGES } from "@/lib/store";
import type { DateRange } from "@/lib/model";
import { cn } from "@/lib/utils";

export type CompareMode = "off" | "prev" | "year";

/* Human label for a comparison mode against the current range. */
export function compareLabel(compare: CompareMode, range: DateRange): string | null {
  if (compare === "prev") return `previous ${range.days} days`;
  if (compare === "year") return "previous year";
  return null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtShort = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const daysInclusive = (a: string, b: string) => Math.max(1, Math.round((+new Date(b) - +new Date(a)) / 86400000) + 1);

/** Build a custom DateRange from two ISO dates (factor mirrors the preset curve: ~days/30). */
export function customRange(start: string, end: string): DateRange {
  const days = daysInclusive(start, end);
  return { key: "custom", label: `${fmtShort(start)} – ${fmtShort(end)}`, days, factor: +(days / 30).toFixed(2), start, end };
}

function defaultCustom(range: DateRange): { start: string; end: string } {
  if (range.start && range.end) return { start: range.start, end: range.end };
  const end = new Date();
  const start = new Date(end.getTime() - (range.days - 1) * 86400000);
  return { start: iso(start), end: iso(end) };
}

export function DateRangePicker({
  range, compare, onRange, onCompare,
}: {
  range: DateRange;
  compare: CompareMode;
  onRange: (r: DateRange) => void;
  onCompare: (c: CompareMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => defaultCustom(range));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const cmpLabel = compareLabel(compare, range);
  const applyCustom = () => { if (draft.start && draft.end) { onRange(customRange(draft.start, draft.end)); setOpen(false); } };
  const pillBtn = (active: boolean) =>
    cn("rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
      active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm hover:bg-muted"
      >
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{range.label}</span>
        {cmpLabel && <span className="text-xs text-muted-foreground">vs {cmpLabel}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick ranges</div>
          <div className="grid grid-cols-2 gap-1.5">
            {RANGES.map((r) => (
              <button key={r.key} className={pillBtn(range.key === r.key)} onClick={() => { onRange(r); setOpen(false); }}>{r.label}</button>
            ))}
          </div>

          <div className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom range</div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={draft.start} max={draft.end || undefined} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={draft.end} min={draft.start || undefined} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" />
          </div>
          <button onClick={applyCustom} className="mt-1.5 w-full rounded-md bg-primary py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">Apply custom range</button>

          <div className="my-3 border-t" />
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compare to</div>
          <div className="grid grid-cols-3 gap-1.5">
            {([["off", "Off"], ["prev", "Prev. period"], ["year", "Prev. year"]] as [CompareMode, string][]).map(([m, label]) => (
              <button key={m} className={pillBtn(compare === m)} onClick={() => onCompare(m)}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
