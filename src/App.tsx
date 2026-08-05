import { useState, useEffect } from "react";
import { CLIENTS, AX, DATA } from "@/data";
import { KpiRow, TrendChart, BarH, GroupBar, Donut, DonutLegend, ChartCard, Grid2, TableCard, num } from "@/components/charts";
import { GoogleAdsView, FbPageView, IgView, Ga4View, CallTrackingView, PipelineView, SpeedToLeadView, ShowRateView, YoyView, EcommerceView, PaymentsView, ReportsView, LinkedInView } from "@/modules/views";
import { A, money, scale } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LogOut, Menu, Pin, PinOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SOURCE_CATALOG, RANGES, loadOps, saveOps as persistOps } from "@/lib/store";
import { DateRangePicker, compareLabel, type CompareMode } from "@/components/date-range";
import { ATTR_MODELS, attribute, attributeAll, type AttrModel } from "@/lib/attribution";
import type { DateRange } from "@/lib/model";
import { getModuleDataAsync, MODULE_SOURCE, type ModuleResult } from "@/lib/provider";
import { generateInsights, type Insight } from "@/lib/insights";
import type { OpsState } from "@/lib/model";
import { cn } from "@/lib/utils";

const NAV: { group: string; items: [string, string, string][] }[] = [
  { group: "Overview", items: [["campaign", "Campaign Performance", "🧩"]] },
  { group: "Paid Media", items: [["googleAds", "Google Ads", "◎"], ["fbAds", "Facebook Ads", "f"]] },
  { group: "Organic & Social", items: [["fbPage", "Facebook Page", "f"], ["igOrganic", "Instagram", "📸"], ["linkedin", "LinkedIn", "in"]] },
  { group: "Analytics", items: [["ga4", "Web Analytics", "📊"]] },
  { group: "Conversion", items: [["callTracking", "Call Tracking", "📞"], ["pipeline", "Pipeline (CRM)", "🧭"], ["speedToLead", "Speed-to-Lead", "⚡"], ["showRate", "Show-Rate", "✅"]] },
  { group: "Business Performance", items: [["attribution", "Attribution & ROI", "💰"], ["yoy", "YoY Trading", "📈"], ["ecommerce", "Ecommerce", "🛍️"], ["payments", "Payments", "💳"], ["cohort", "Cohort & LTV", "🔁"]] },
  { group: "Reports", items: [["reports", "Report Templates", "📄"]] },
];
const LABELS: Record<string, string> = { campaign: "Campaign Performance", googleAds: "Google Ads", fbAds: "Facebook Ads", fbPage: "Facebook Page", igOrganic: "Instagram", linkedin: "LinkedIn", ga4: "Web Analytics", callTracking: "Call Tracking", pipeline: "Pipeline (CRM)", speedToLead: "Speed-to-Lead", showRate: "Show-Rate", attribution: "Attribution & ROI", yoy: "YoY Trading", ecommerce: "Ecommerce", payments: "Payments", cohort: "Cohort & LTV", reports: "Report Templates" };
const VIEWS: Record<string, (p: { d: any; f: number }) => JSX.Element> = { campaign: CampaignView, googleAds: GoogleAdsView, fbAds: FbAdsView, fbPage: FbPageView, igOrganic: IgView, linkedin: LinkedInView, ga4: Ga4View, callTracking: CallTrackingView, pipeline: PipelineView, speedToLead: SpeedToLeadView, showRate: ShowRateView, attribution: AttributionView, yoy: YoyView, ecommerce: EcommerceView, payments: PaymentsView, cohort: CohortView, reports: ReportsView };

/* App version — bump the patch (1.0.1, 1.0.2, …) on every release. */
const VERSION = "1.0.5";

/* ---------- multi-tenant: roles, subscriptions, admin ---------- */
const ALL_MODULES = NAV.flatMap((s) => s.items);
const VIA_LABEL: Record<string, string> = { crm: "Entangle CRM", portal: "Portal API", meta: "Meta", google: "Google", bq: "BigQuery" };

/* ================= Theme switcher ================= */
const THEMES = [
  { id: "entangle", name: "Entangle", dot: "#6366f1" },
  { id: "midnight", name: "Midnight", dot: "#818cf8" },
  { id: "ocean", name: "Ocean", dot: "#0ea5e9" },
  { id: "emerald", name: "Emerald", dot: "#10b981" },
  { id: "rose", name: "Rose", dot: "#f43f5e" },
  { id: "slate", name: "Slate", dot: "#475569" },
];
function ThemeSwitcher({ theme, setTheme }: { theme: string; setTheme: (t: string) => void }) {
  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {THEMES.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: t.dot }} />{t.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ================= AI Insights panel ================= */
function InsightsPanel({ insights, live }: { insights: Insight[]; live: boolean }) {
  return (
    <Card className="mb-4 border-primary/30 bg-primary/[0.03]">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[15px]">✨ AI Insights</CardTitle>
        <Badge variant={live ? "success" : "secondary"}>{live ? "live" : "sample"}</Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {insights.map((i, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <span className={i.kind === "up" ? "text-success" : i.kind === "down" ? "text-destructive" : "text-muted-foreground"}>{i.kind === "up" ? "▲" : i.kind === "down" ? "▼" : "›"}</span>
            <span>{i.text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ================= Login ================= */
function Login({ onLogin, theme, setTheme }: { onLogin: (u: any) => void; theme: string; setTheme: (t: string) => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-secondary via-background to-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-teal-400 text-2xl font-extrabold text-white">E</div>
          <h1 className="text-xl font-bold">Entangle Client Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to view your marketing performance.</p>
          <div className="mt-6 space-y-2.5">
            <Button className="w-full justify-center" onClick={() => onLogin({ role: "admin", clientId: null })}>⚙️&nbsp; Sign in as Admin (Entangle)</Button>
            <Button variant="outline" className="w-full justify-center" onClick={() => onLogin({ role: "client", clientId: "aqua-pulse-spas" })}>Sign in as Aqua Pulse Spas (client)</Button>
          </div>
          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground"><b>Admin</b> manages all 25 clients (subscriptions, connections, targets). A <b>client</b> sees only their own subscribed dashboards — no admin panel.</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">Theme <ThemeSwitcher theme={theme} setTheme={setTheme} /></div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================= Admin panel (settings) ================= */
function AdminPanel({ client, ops, setOps }: { client: string; ops: OpsState; setOps: (o: OpsState) => void }) {
  const cRec = ops.clients.find((x) => x.id === client)!;
  const subs = ops.subs[client] || [];
  const conns = ops.connections[client] || [];
  const targets = ops.targets[client] || [];

  const toggleSub = (k: string) => { const set = new Set(subs); set.has(k) ? set.delete(k) : set.add(k); setOps({ ...ops, subs: { ...ops.subs, [client]: [...set] } }); };
  const upsertConn = (source: string, changes: any) => {
    const list = [...conns]; const i = list.findIndex((x) => x.source === source);
    const cat = SOURCE_CATALOG.find((s) => s.key === source)!;
    if (i >= 0) list[i] = { ...list[i], ...changes }; else list.push({ source, accountId: "", status: "disconnected", via: cat.via, ...changes });
    setOps({ ...ops, connections: { ...ops.connections, [client]: list } });
  };
  const setTarget = (kpi: string, value: number) => setOps({ ...ops, targets: { ...ops.targets, [client]: targets.map((t) => t.kpi === kpi ? { ...t, value } : t) } });
  const setField = (field: string, val: string) => setOps({ ...ops, clients: ops.clients.map((x) => x.id === client ? { ...x, [field]: val } : x) });
  const schedules: any[] = (ops.schedules && ops.schedules[client]) || [];
  const setSchedules = (list: any[]) => setOps({ ...ops, schedules: { ...(ops.schedules || {}), [client]: list } });
  const addSchedule = () => setSchedules([...schedules, { id: "s-" + Date.now(), report: "Monthly", cadence: "1st of month", recipients: cRec.contact, format: "PDF", nextRun: "next cycle", active: true }]);

  return (
    <Tabs defaultValue="connections" className="space-y-4">
      <TabsList>
        <TabsTrigger value="connections">Data Sources</TabsTrigger>
        <TabsTrigger value="modules">Modules</TabsTrigger>
        <TabsTrigger value="targets">Targets</TabsTrigger>
        <TabsTrigger value="reports">Report Schedules</TabsTrigger>
        <TabsTrigger value="settings">Client Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="connections">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">Data sources — {cRec.name}</CardTitle><p className="text-xs text-muted-foreground">Account IDs + connection status. Each source is supplied by a live pipe (CRM / Portal API / Meta / Google / BigQuery).</p></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Account ID</TableHead><TableHead>Supplied via</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Connect</TableHead></TableRow></TableHeader>
              <TableBody>{SOURCE_CATALOG.map((s) => { const c = conns.find((x) => x.source === s.key); const on = c?.status === "connected"; return (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell><Input className="h-8 w-44" placeholder={s.idLabel} value={c?.accountId || ""} onChange={(e) => upsertConn(s.key, { accountId: e.target.value })} /></TableCell>
                  <TableCell><Badge variant="secondary">{VIA_LABEL[s.via]}</Badge></TableCell>
                  <TableCell>{c?.status === "connected" ? <Badge variant="success">Connected</Badge> : c?.status === "error" ? <Badge variant="destructive" title={c.error}>Error</Badge> : <Badge variant="muted">Not connected</Badge>}</TableCell>
                  <TableCell><div className="flex justify-end"><Switch checked={on} onCheckedChange={(v) => upsertConn(s.key, { status: v ? "connected" : "disconnected", lastSync: v ? "just now" : undefined })} /></div></TableCell>
                </TableRow>
              ); })}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="modules">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">Module subscriptions</CardTitle><p className="text-xs text-muted-foreground">Which dashboards {cRec.name} sees at login</p></CardHeader>
          <CardContent><div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{ALL_MODULES.map(([k, label, icon]) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-xs">{icon}</span>
              <div className="flex-1 min-w-0"><div className="truncate text-sm font-medium">{label}</div><div className="truncate text-[10px] text-muted-foreground">{MODULE_SOURCE[k]}</div></div>
              <Switch checked={subs.includes(k)} onCheckedChange={() => toggleSub(k)} />
            </div>))}</div></CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="targets">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">KPI targets</CardTitle><p className="text-xs text-muted-foreground">Drive goal pacing + the KPI scorecard</p></CardHeader>
          <CardContent><Table>
            <TableHeader><TableRow><TableHead>KPI</TableHead><TableHead>Target</TableHead><TableHead>Period</TableHead><TableHead>Goal</TableHead></TableRow></TableHeader>
            <TableBody>{targets.map((t) => <TableRow key={t.kpi}><TableCell className="font-medium">{t.kpi}</TableCell><TableCell><Input className="h-8 w-32" type="number" value={t.value} onChange={(e) => setTarget(t.kpi, Number(e.target.value))} /></TableCell><TableCell className="text-muted-foreground">{t.period}</TableCell><TableCell><Badge variant="secondary">{t.higherIsBetter ? "Higher is better" : "Lower is better"}</Badge></TableCell></TableRow>)}</TableBody>
          </Table></CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="reports">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div><CardTitle className="text-[15px]">Report schedules — {cRec.name}</CardTitle><p className="text-xs text-muted-foreground">Automated delivery config. Sending requires the backend cron + email service.</p></div>
            <Button size="sm" onClick={addSchedule}>+ Add schedule</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Report</TableHead><TableHead>Cadence</TableHead><TableHead>Recipients</TableHead><TableHead>Format</TableHead><TableHead>Next run</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>{schedules.length ? schedules.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.report}</TableCell>
                  <TableCell>{s.cadence}</TableCell>
                  <TableCell><Input className="h-8 w-52" value={s.recipients} onChange={(e) => setSchedules(schedules.map((x) => x.id === s.id ? { ...x, recipients: e.target.value } : x))} /></TableCell>
                  <TableCell><Badge variant="secondary">{s.format}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{s.nextRun}</TableCell>
                  <TableCell><Switch checked={s.active} onCheckedChange={() => setSchedules(schedules.map((x) => x.id === s.id ? { ...x, active: !x.active } : x))} /></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => setSchedules(schedules.filter((x) => x.id !== s.id))}>Remove</Button></TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No schedules — add one.</TableCell></TableRow>}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settings">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-[15px]">Client settings — {cRec.name}</CardTitle></CardHeader>
          <CardContent><div className="grid gap-4 sm:grid-cols-2">
            {([["name", "Name"], ["website", "Website"], ["industry", "Industry"], ["plan", "Plan"], ["currency", "Currency"], ["timezone", "Timezone"], ["manager", "Account manager"], ["contact", "Primary contact"]] as const).map(([field, label]) => (
              <label key={field} className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span><Input value={(cRec as any)[field] || ""} onChange={(e) => setField(field, e.target.value)} /></label>
            ))}
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
              <Select value={cRec.status} onValueChange={(v) => setField("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="churned">Churned</SelectItem></SelectContent></Select>
            </label>
          </div></CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

/* ================= Portal (shell) ================= */
function Portal({ user, ops, setOps, onLogout, theme, setTheme }: { user: any; ops: OpsState; setOps: (o: OpsState) => void; onLogout: () => void; theme: string; setTheme: (t: string) => void }) {
  const isAdmin = user.role === "admin";
  const [client, setClient] = useState<string>(isAdmin ? ops.clients[0].id : user.clientId);
  const subs: string[] = ops.subs[client] || [];
  const firstMod = () => ALL_MODULES.find(([k]) => (ops.subs[client] || []).includes(k))?.[0] ?? "campaign";
  const [mod, setMod] = useState<string>(isAdmin ? "__admin__" : firstMod());
  const [range, setRange] = useState<DateRange>(RANGES[1]);
  const [compare, setCompare] = useState<CompareMode>("off");
  const cmpLabel = compareLabel(compare, range);
  const c = ops.clients.find((x) => x.id === client) ?? ops.clients[0];
  const group = NAV.find((s) => s.items.some((it) => it[0] === mod))?.group ?? "";
  const View = mod !== "__admin__" ? VIEWS[mod] : null;
  const [live, setLive] = useState(false);
  const [result, setResult] = useState<ModuleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const sidebarOpen = pinned || hovering;
  useEffect(() => {
    if (mod === "__admin__") { setResult(null); return; }
    let alive = true; setLoading(true);
    getModuleDataAsync(c, mod, range, live, ops.connections[client] || []).then((r) => { if (alive) { setResult(r); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, client, range.key, range.factor, live]);
  const insights = result ? generateInsights(mod, result.d, result.f, ops.targets[client] || [], range.factor) : [];

  const onClient = (v: string) => {
    setClient(v);
    const next = ops.subs[v] || [];
    if (mod !== "__admin__" && !next.includes(mod)) setMod(ALL_MODULES.find(([k]) => next.includes(k))?.[0] ?? "__admin__");
  };
  const navBtn = (k: string, label: string, icon: string, active: boolean) => (
    <button key={k} onClick={() => setMod(k)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs", active ? "bg-primary text-primary-foreground" : "bg-muted")}>{icon}</span>{label}
    </button>
  );

  return (
    <div className="app-grid relative min-h-screen bg-background">
      {/* hover hot-zone at the left edge reveals the auto-hidden sidebar */}
      <div className="no-print fixed left-0 top-0 z-30 h-screen w-3" onMouseEnter={() => setHovering(true)} aria-hidden />
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "no-print fixed left-0 top-0 z-40 flex h-screen w-[264px] flex-col gap-1 overflow-y-auto border-r bg-card p-4 transition-transform duration-200 ease-out",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        )}
      >
        <div className="flex items-start justify-between px-2 pb-4 pt-1">
          <div>
            <img src="/assets/entangle-logotype-dark.svg" alt="Entangle" className="logo-dark h-[21px] w-auto" />
            <img src="/assets/entangle-logotype-light.svg" alt="Entangle" className="logo-light h-[21px] w-auto" />
            <div className="mt-1 text-[8px] font-semibold uppercase tracking-wider text-muted-foreground">{isAdmin ? "Admin Console" : "Client Portal"}</div>
          </div>
          <button
            onClick={() => setPinned((p) => !p)}
            title={pinned ? "Unpin sidebar (auto-hide)" : "Pin sidebar open"}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        </div>
        {isAdmin && (
          <div className="px-1 pb-2">
            <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Client</div>
            <Select value={client} onValueChange={onClient}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ops.clients.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <nav className="flex flex-col gap-0.5">
          {NAV.map((sec) => {
            const items = sec.items.filter(([k]) => subs.includes(k));
            if (!items.length) return null;
            return (
              <div key={sec.group}>
                <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{sec.group}</div>
                {items.map(([k, label, icon]) => navBtn(k, label, icon, mod === k))}
              </div>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 pt-3">
          {isAdmin && navBtn("__admin__", "Admin Panel", "⚙️", mod === "__admin__")}
          <div className="flex items-center gap-2 border-t px-2 pt-3 text-[11px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success" /> Recharts + shadcn/ui
            <span className="ml-auto font-medium tabular-nums">V{VERSION}</span>
          </div>
        </div>
      </aside>

      <main className={cn("min-w-0 transition-[padding] duration-200 ease-out", pinned && "pl-[264px]")}>
        <header className="no-print sticky top-0 z-20 flex items-center gap-4 border-b bg-background/80 px-6 py-3 backdrop-blur">
          <button
            onMouseEnter={() => setHovering(true)}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? "Unpin sidebar (auto-hide)" : "Pin sidebar open"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border hover:bg-muted"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">{mod === "__admin__" ? "Settings" : group}</div>
            <h1 className="text-lg font-bold tracking-tight">{mod === "__admin__" ? "Admin Panel" : LABELS[mod]}</h1>
            {result && <div className="mt-0.5 text-[11px] text-muted-foreground">{c.currency} · {range.label}{cmpLabel ? ` · vs ${cmpLabel}` : ""} · {result.freshness} · via {result.source}</div>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeSwitcher theme={theme} setTheme={setTheme} />
            {mod !== "__admin__" && (
              <DateRangePicker range={range} compare={compare} onRange={setRange} onCompare={setCompare} />
            )}
            {mod !== "__admin__" && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={live} onCheckedChange={setLive} /> Live</label>
            )}
            {mod !== "__admin__" && (
              <Button variant="outline" size="sm" onClick={() => window.print()}>Export PDF</Button>
            )}
            <div className="flex items-center gap-2 border-l pl-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: c.brandColor }}>{c.initials}</div>
              <div className="text-sm font-semibold leading-tight">{c.name}</div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}><LogOut className="h-4 w-4" /> Log out</Button>
          </div>
        </header>
        <div className="content-print p-6">
          <div className="print-only mb-4">
            <div className="text-lg font-bold">{c.name} — {mod === "__admin__" ? "Admin" : LABELS[mod]}</div>
            <div className="text-xs text-muted-foreground">{range.label} · generated {new Date().toLocaleDateString()}</div>
          </div>
          {mod === "__admin__" ? (
            <AdminPanel client={client} ops={ops} setOps={setOps} />
          ) : loading || !result || result.mod !== mod ? (
            <div className="py-24 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              {insights.length > 0 && <InsightsPanel insights={insights} live={result.live} />}
              {View && <View key={mod + client + range.key + range.factor + (result.live ? "live" : "")} d={result.d} f={result.f} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ================= App (auth gate) ================= */
export default function App() {
  const [user, setUser] = useState<any>(() => JSON.parse(localStorage.getItem("dbm-user") || "null"));
  const [ops, setOpsState] = useState<OpsState>(() => loadOps());
  const setOps = (o: OpsState) => { setOpsState(o); persistOps(o); };
  const login = (u: any) => { localStorage.setItem("dbm-user", JSON.stringify(u)); setUser(u); };
  const logout = () => { localStorage.removeItem("dbm-user"); setUser(null); };
  const [theme, setTheme] = useState(() => localStorage.getItem("dbm-theme") || "entangle");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("dbm-theme", theme); }, [theme]);
  const validUser = user && (user.role === "admin" || ops.clients.some((cl) => cl.id === user.clientId)) ? user : null;
  if (!validUser) return <Login onLogin={login} theme={theme} setTheme={setTheme} />;
  return <Portal key={validUser.role + (validUser.clientId || "")} user={validUser} ops={ops} setOps={setOps} onLogout={logout} theme={theme} setTheme={setTheme} />;
}

/* ================= Campaign ================= */
function CampaignView({ d, f }: { d: any; f: number }) {
  const donut = <><Donut labels={d.mix.labels} data={A(d.mix.data, f)} /><DonutLegend labels={d.mix.labels} data={A(d.mix.data, f)} money /></>;
  const trend = <TrendChart labels={AX} series={[{ name: "Spend", data: A(d.trend.spend, f) }, { name: "Conv.", data: A(d.trend.conv, f) }]} dual />;
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="channels">Channel Comparison</TabsTrigger><TabsTrigger value="trends">Trends</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-4">
        <KpiRow items={d.kpis} f={f} />
        <Grid2><ChartCard title="Ad spend by channel">{donut}</ChartCard><ChartCard title="Blended spend & conversions" legend={["Spend", "Conv."]}>{trend}</ChartCard></Grid2>
      </TabsContent>
      <TabsContent value="channels">
        <Grid2>
          <ChartCard title="Spend share">{donut}</ChartCard>
          <TableCard title="Performance by channel">
            <Table>
              <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Conv.</TableHead><TableHead className="text-right">ROAS</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
              <TableBody>{d.channels.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.ch}</TableCell><TableCell className={num()}>{money(scale(x.spend, f))}</TableCell><TableCell className={num()}>{scale(x.conv, f)}</TableCell><TableCell className={num()}>{x.roas}x</TableCell><TableCell className={num()}>{money(scale(x.rev, f))}</TableCell></TableRow>)}</TableBody>
            </Table>
          </TableCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="trends"><ChartCard title="Blended spend & conversions" desc="All paid channels combined" legend={["Spend", "Conv."]}><TrendChart labels={AX} series={[{ name: "Spend", data: A(d.trend.spend, f) }, { name: "Conv.", data: A(d.trend.conv, f) }]} dual height={340} /></ChartCard></TabsContent>
    </Tabs>
  );
}

/* ================= Facebook Ads ================= */
function FbAdsView({ d, f }: { d: any; f: number }) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="spend">Spend & Results</TabsTrigger><TabsTrigger value="campaigns">Campaigns</TabsTrigger><TabsTrigger value="audience">Audience</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-4">
        <KpiRow items={d.kpis} f={f} />
        <Grid2>
          <ChartCard title="Spend & Results" legend={["Spend", "Results"]}><TrendChart labels={AX} series={[{ name: "Spend", data: A(d.spend.spend, f) }, { name: "Results", data: A(d.spend.results, f) }]} dual /></ChartCard>
          <ChartCard title="Reach vs Impressions" legend={["Reach", "Impr."]}><TrendChart labels={AX} series={[{ name: "Reach", data: A(d.reach.reach, f) }, { name: "Impr.", data: A(d.reach.impr, f) }]} /></ChartCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="spend" className="space-y-4">
        <ChartCard title="Spend & Results" legend={["Spend", "Results"]}><TrendChart labels={AX} series={[{ name: "Spend", data: A(d.spend.spend, f) }, { name: "Results", data: A(d.spend.results, f) }]} dual height={320} /></ChartCard>
        <ChartCard title="Spend by campaign"><BarH labels={d.campaigns.map((x: any) => x.name)} data={A(d.campaigns.map((x: any) => x.spend), f)} /></ChartCard>
      </TabsContent>
      <TabsContent value="campaigns">
        <TableCard title="Campaign performance">
          <Table>
            <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Reach</TableHead><TableHead className="text-right">CTR</TableHead><TableHead className="text-right">Results</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
            <TableBody>{d.campaigns.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.name}</TableCell><TableCell><Badge variant={x.status === "on" ? "success" : "warning"}>{x.status === "on" ? "Active" : "Paused"}</Badge></TableCell><TableCell className={num()}>{money(scale(x.spend, f))}</TableCell><TableCell className={num()}>{scale(x.reach, f).toLocaleString("en-AU")}</TableCell><TableCell className={num()}>{x.ctr}%</TableCell><TableCell className={num()}>{scale(x.results, f)}</TableCell><TableCell className={num()}>{x.roas}x</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableCard>
      </TabsContent>
      <TabsContent value="audience">
        <Grid2>
          <ChartCard title="Reach by age & gender" legend={["Women", "Men"]}><GroupBar labels={d.demo.labels} groups={[{ name: "Women", data: d.demo.women }, { name: "Men", data: d.demo.men }]} /></ChartCard>
          <ChartCard title="Spend by placement"><Donut labels={d.placements.labels} data={d.placements.data} /><DonutLegend labels={d.placements.labels} data={d.placements.data} /></ChartCard>
        </Grid2>
      </TabsContent>
    </Tabs>
  );
}

/* ================= Attribution models (multi-touch) ================= */
function AttributionModels({ d, f }: { d: any; f: number }) {
  const [model, setModel] = useState<AttrModel>("linear");
  const attr = attribute(d.paths, model);
  const all = attributeAll(d.paths);
  const totalRev = attr.reduce((a, x) => a + x.revenue, 0) || 1;
  const spendOf = (ch: string) => d.channels.find((x: any) => x.ch === ch)?.spend ?? 0;
  const channels = Object.keys(all);
  const topPaths = [...d.paths].sort((a: any, b: any) => b.conv - a.conv);
  const active = ATTR_MODELS.find((m) => m.key === model)!;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ATTR_MODELS.map((m) => (
          <button key={m.key} onClick={() => setModel(m.key)}
            className={cn("rounded-lg border p-3 text-left transition-colors", model === m.key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
            <div className={cn("text-sm font-semibold", model === m.key && "text-primary")}>{m.label}</div>
            <div className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{m.desc}</div>
          </button>
        ))}
      </div>

      <Grid2>
        <ChartCard title={`Attributed revenue by channel — ${active.label}`}>
          <BarH labels={attr.map((a) => a.channel)} data={A(attr.map((a) => a.revenue), f)} />
        </ChartCard>
        <TableCard title="Channel economics (selected model)">
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Attr. Revenue</TableHead><TableHead className="text-right">Share</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
            <TableBody>{attr.map((a, i) => { const sp = spendOf(a.channel); return (
              <TableRow key={i}>
                <TableCell className="font-medium">{a.channel}</TableCell>
                <TableCell className={num()}>{money(scale(a.revenue, f))}</TableCell>
                <TableCell className={num()}>{Math.round((a.revenue / totalRev) * 100)}%</TableCell>
                <TableCell className={num()}>{sp ? money(scale(sp, f)) : "—"}</TableCell>
                <TableCell className={num()}>{sp ? (a.revenue / sp).toFixed(1) + "x" : "—"}</TableCell>
              </TableRow>
            ); })}</TableBody>
          </Table>
        </TableCard>
      </Grid2>

      <TableCard title="Model comparison — attributed revenue by channel" >
        <Table>
          <TableHeader><TableRow><TableHead>Channel</TableHead>{ATTR_MODELS.map((m) => <TableHead key={m.key} className="text-right">{m.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{channels.map((ch, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{ch}</TableCell>
              {ATTR_MODELS.map((m) => <TableCell key={m.key} className={cn(num(), model === m.key && "bg-primary/5 font-semibold")}>{money(scale(all[ch][m.key], f))}</TableCell>)}
            </TableRow>
          ))}</TableBody>
        </Table>
      </TableCard>

      <TableCard title="Top conversion paths — the journeys credit is split across">
        <Table>
          <TableHeader><TableRow><TableHead>Journey (touchpoints)</TableHead><TableHead className="text-right">Conversions</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
          <TableBody>{topPaths.map((p: any, i: number) => (
            <TableRow key={i}>
              <TableCell><div className="flex flex-wrap items-center gap-1">{p.path.map((ch: string, j: number) => (
                <span key={j} className="flex items-center gap-1"><Badge variant="muted">{ch}</Badge>{j < p.path.length - 1 && <span className="text-muted-foreground">→</span>}</span>
              ))}</div></TableCell>
              <TableCell className={num()}>{scale(p.conv, f)}</TableCell>
              <TableCell className={num()}>{money(scale(p.rev, f))}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </TableCard>
    </div>
  );
}

/* ================= Attribution & ROI ================= */
function AttributionView({ d, f }: { d: any; f: number }) {
  const chNames = d.channels.map((x: any) => x.ch);
  const spendVsRev = <GroupBar labels={chNames} groups={[{ name: "Spend", data: A(d.channels.map((x: any) => x.spend), f) }, { name: "Revenue", data: A(d.channels.map((x: any) => x.rev), f) }]} />;
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="models">Attribution Models</TabsTrigger><TabsTrigger value="spendrev">Spend → Revenue</TabsTrigger><TabsTrigger value="funnel">Spend-to-Close Funnel</TabsTrigger><TabsTrigger value="geo">Closes by Geo</TabsTrigger><TabsTrigger value="roi">ROI by Campaign</TabsTrigger></TabsList>
      <TabsContent value="models"><AttributionModels d={d} f={f} /></TabsContent>
      <TabsContent value="overview" className="space-y-4">
        <KpiRow items={d.kpis} f={f} />
        <Grid2>
          <ChartCard title="Spend vs revenue by channel" legend={["Spend", "Revenue"]}>{spendVsRev}</ChartCard>
          <ChartCard title="Attributed revenue by channel"><Donut labels={chNames} data={A(d.channels.map((x: any) => x.rev), f)} /><DonutLegend labels={chNames} data={A(d.channels.map((x: any) => x.rev), f)} money /></ChartCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="spendrev" className="space-y-4">
        <ChartCard title="Spend vs attributed revenue" desc="Cost vs return, per channel" legend={["Spend", "Revenue"]}>{spendVsRev}</ChartCard>
        <TableCard title="Channel economics">
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Attr. Revenue</TableHead><TableHead className="text-right">ROAS</TableHead><TableHead className="text-right">Closes</TableHead><TableHead className="text-right">Cost / Close</TableHead></TableRow></TableHeader>
            <TableBody>{d.channels.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.ch}</TableCell><TableCell className={num()}>{money(scale(x.spend, f))}</TableCell><TableCell className={num()}>{money(scale(x.rev, f))}</TableCell><TableCell className={num()}>{x.roas}x</TableCell><TableCell className={num()}>{scale(x.closes, f)}</TableCell><TableCell className={num()}>${Math.round(x.spend / x.closes)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableCard>
      </TabsContent>
      <TabsContent value="funnel">
        <Grid2>
          <ChartCard title="Impressions → Closes" desc="Volume at each stage"><BarH labels={d.funnel.map((x: any) => x.s)} data={A(d.funnel.map((x: any) => x.v), f)} /></ChartCard>
          <TableCard title="Stage economics">
            <Table>
              <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Cost / stage</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.funnel.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.s}</TableCell><TableCell className={num()}>{scale(x.v, f).toLocaleString("en-AU")}</TableCell><TableCell className={num()}>${(40170 / x.v).toFixed(2)}</TableCell></TableRow>)}
                <TableRow className="bg-muted/40"><TableCell className="font-semibold">Revenue</TableCell><TableCell className={num("font-semibold")}>{money(scale(d.revenue, f))}</TableCell><TableCell className={num()}>—</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="geo">
        <Grid2>
          <ChartCard title="Closed revenue by region"><BarH labels={d.geo.map((x: any) => x.r)} data={A(d.geo.map((x: any) => x.rev), f)} /></ChartCard>
          <TableCard title="Regions">
            <Table>
              <TableHeader><TableRow><TableHead>Region</TableHead><TableHead className="text-right">Closes</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
              <TableBody>{d.geo.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.r}</TableCell><TableCell className={num()}>{scale(x.closes, f)}</TableCell><TableCell className={num()}>{money(scale(x.rev, f))}</TableCell></TableRow>)}</TableBody>
            </Table>
          </TableCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="roi" className="space-y-4">
        <TableCard title="ROI by campaign — down to closed revenue">
          <Table>
            <TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Closes</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
            <TableBody>{d.campaigns.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.name}</TableCell><TableCell><Badge variant="muted">{x.channel}</Badge></TableCell><TableCell className={num()}>{money(scale(x.spend, f))}</TableCell><TableCell className={num()}>{scale(x.closes, f)}</TableCell><TableCell className={num()}>{money(scale(x.rev, f))}</TableCell><TableCell className={num()}>{x.roas}x</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableCard>
        <ChartCard title="Attributed revenue by campaign"><BarH labels={d.campaigns.map((x: any) => x.name)} data={A(d.campaigns.map((x: any) => x.rev), f)} /></ChartCard>
      </TabsContent>
    </Tabs>
  );
}

/* ================= Cohort & LTV ================= */
function CohortView({ d, f }: { d: any; f: number }) {
  const retention = <GroupBar labels={d.retention.labels} groups={[{ name: "Retained %", data: d.retention.curve }]} />;
  const repeat = <><Donut labels={d.repeat.labels} data={A(d.repeat.data, f)} /><DonutLegend labels={d.repeat.labels} data={A(d.repeat.data, f)} /></>;
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="retention">Retention</TabsTrigger><TabsTrigger value="ltv">LTV</TabsTrigger><TabsTrigger value="repeat">Repeat Purchase</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-4">
        <KpiRow items={d.kpis} f={f} />
        <Grid2><ChartCard title="Retention curve" desc="% retained by month">{retention}</ChartCard><ChartCard title="Orders per customer">{repeat}</ChartCard></Grid2>
      </TabsContent>
      <TabsContent value="retention">
        <Grid2>
          <ChartCard title="Retention curve (%)">{retention}</ChartCard>
          <TableCard title="Cohorts by acquisition month">
            <Table>
              <TableHeader><TableRow><TableHead>Cohort</TableHead><TableHead className="text-right">Size</TableHead><TableHead className="text-right">Mo 1</TableHead><TableHead className="text-right">Mo 3</TableHead><TableHead className="text-right">Mo 6</TableHead></TableRow></TableHeader>
              <TableBody>{d.cohorts.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.m}</TableCell><TableCell className={num()}>{scale(x.size, f)}</TableCell><TableCell className={num()}>{x.r1}%</TableCell><TableCell className={num()}>{x.r3}%</TableCell><TableCell className={num()}>{x.r6}%</TableCell></TableRow>)}</TableBody>
            </Table>
          </TableCard>
        </Grid2>
      </TabsContent>
      <TabsContent value="ltv" className="space-y-4">
        <TableCard title="Lifetime value by acquisition channel">
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">LTV</TableHead><TableHead className="text-right">CAC</TableHead><TableHead className="text-right">LTV:CAC</TableHead></TableRow></TableHeader>
            <TableBody>{d.ltv.map((x: any, i: number) => <TableRow key={i}><TableCell className="font-medium">{x.ch}</TableCell><TableCell className={num()}>{money(x.ltv)}</TableCell><TableCell className={num()}>{money(x.cac)}</TableCell><TableCell className={num()}>{x.ratio}x</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableCard>
        <ChartCard title="LTV by channel"><BarH labels={d.ltv.map((x: any) => x.ch)} data={d.ltv.map((x: any) => x.ltv)} /></ChartCard>
      </TabsContent>
      <TabsContent value="repeat"><Grid2><ChartCard title="Orders per customer">{repeat}</ChartCard><TableCard title="Breakdown"><Table><TableHeader><TableRow><TableHead>Segment</TableHead><TableHead className="text-right">Customers</TableHead></TableRow></TableHeader><TableBody>{d.repeat.labels.map((l: string, i: number) => <TableRow key={i}><TableCell className="font-medium">{l}</TableCell><TableCell className={num()}>{scale(d.repeat.data[i], f)}</TableCell></TableRow>)}</TableBody></Table></TableCard></Grid2></TabsContent>
    </Tabs>
  );
}
