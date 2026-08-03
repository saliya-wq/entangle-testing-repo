# Dashboard Mockup — Entangle client portal (Recharts + shadcn/ui)

A standalone Vite + React + TypeScript + Tailwind app: a multi-tenant client dashboard
portal mockup on the target stack (shadcn/ui components, Recharts charts).

## Run

```bash
cd dashboard-mockup
npm install
npm run dev        # http://localhost:5173
```

## What's inside
- **17 modules** across Paid / Organic / Analytics / Conversion / Business Performance / Reports,
  each with sub-sections (shadcn Tabs) and Recharts visualisations.
- **Roles**: Admin + client login. Admin manages 25 seeded clients — module subscriptions,
  data-source connections (account IDs + status), and KPI targets. Clients see only their
  subscribed modules.
- **Selectable themes** (token-based; charts recolour with the theme).
- **Provider seam** (`src/lib/provider.ts`) — the single place mock data flips to live
  (Entangle CRM / clients.entangle.com.au / Meta / Google / BigQuery). Sample data today.

State persists to `localStorage`. Not yet wired into the ELS build or Clerk auth — this is
the standalone prototype pending the fold-in.
