/* ============================================================
   Metrics layer — the math behind the KPI cards.
   Pure, side-effect-free derivations from BASE inputs (spend,
   revenue, orders, visitors, clicks, impressions, funnel counts,
   customer counts, margin). KPI cards are DERIVED from these so a
   card can never disagree with the table/chart beneath it, and the
   live wiring only needs to supply base inputs — not pre-computed
   ratios. Formulas follow standard ecommerce definitions
   (CVR, AOV, ROAS/MER, CPC/CPM/CPA, cart abandonment, etc.).
   ============================================================ */
import type { Kpi } from "@/components/charts";

const div = (a: number, b: number) => (b ? a / b : 0);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/* ---- ratios & rates ---- */
export const pctDelta = (cur: number, prior: number) => (prior ? ((cur - prior) / prior) * 100 : 0);
export const cvr = (conversions: number, visitors: number) => div(conversions, visitors) * 100;
export const aov = (revenue: number, orders: number) => div(revenue, orders);
export const roas = (revenue: number, spend: number) => div(revenue, spend);
export const mer = roas; // Marketing Efficiency Ratio = blended ROAS (total rev / total spend)
export const ctr = (clicks: number, impressions: number) => div(clicks, impressions) * 100;
export const cpc = (spend: number, clicks: number) => div(spend, clicks);
export const cpm = (spend: number, impressions: number) => div(spend, impressions) * 1000;
export const cpa = (spend: number, acquisitions: number) => div(spend, acquisitions);
export const cac = (marketingCost: number, newCustomers: number) => div(marketingCost, newCustomers);
export const revenuePerVisitor = (revenue: number, visitors: number) => div(revenue, visitors);
export const grossMarginPct = (price: number, cogs: number) => (price ? ((price - cogs) / price) * 100 : 0);
export const beroas = (marginPct: number) => (marginPct ? 100 / marginPct : 0); // breakeven ROAS = 1 / margin
export const cartAbandonment = (purchases: number, carts: number) => (1 - div(purchases, carts)) * 100;
export const addToCartRate = (addToCarts: number, visitors: number) => div(addToCarts, visitors) * 100;
export const retentionRate = (endCust: number, newCust: number, startCust: number) => div(endCust - newCust, startCust) * 100;
export const returningRate = (repeat: number, total: number) => div(repeat, total) * 100;
export const churnRate = (lost: number, total: number) => div(lost, total) * 100;
export const refundRate = (refunds: number, sales: number) => div(refunds, sales) * 100;

/* ---- KPI card builder: value + optional period-over-period delta ---- */
export function kpi(
  l: string, v: number, fmt: string,
  o: { prior?: number; hero?: boolean; good?: "down"; rate?: boolean } = {},
): Kpi {
  const k: Kpi = { l, v, fmt };
  if (o.rate) k.rate = true;
  if (o.hero) k.hero = true;
  if (o.good) k.good = o.good;
  if (o.prior != null && o.prior !== 0) {
    const delta = pctDelta(v, o.prior);
    k.d = Math.abs(Math.round(delta * 10) / 10);
    k.dir = delta >= 0 ? "up" : "down";
  }
  return k;
}

/* ============================================================
   Per-module derivations — read base inputs + the same sub-data
   the page renders, so headline cards reconcile with the tables.
   ============================================================ */

/** Campaign overview — derived from the channel breakdown (spend/conv/rev). */
export function campaignKpis(d: any): Kpi[] {
  const spend = sum(d.channels.map((x: any) => x.spend));
  const conv = sum(d.channels.map((x: any) => x.conv));
  const rev = sum(d.channels.map((x: any) => x.rev));
  const p = d.base.prior;
  return [
    kpi("Total Ad Spend", spend, "$", { hero: true, prior: p.spend }),
    kpi("Total Reach", d.base.reach, "c", { prior: p.reach }),
    kpi("Conversions", conv, "n", { prior: p.conv }),
    kpi("Attributed Revenue", rev, "$", { prior: p.rev }),
    kpi("Blended ROAS", mer(rev, spend), "x", { rate: true, prior: mer(p.rev, p.spend) }),
    kpi("Cost / Conv.", cpa(spend, conv), "$", { rate: true, good: "down", prior: cpa(p.spend, p.conv) }),
  ];
}

/** GA4 — funnel-driven conversion economics (reconciles with the funnel chart). */
export function ga4Kpis(d: any): Kpi[] {
  const b = d.base, p = b.prior;
  const fn: Record<string, number> = Object.fromEntries(d.funnel.map((x: any) => [x.s, x.v]));
  const sessions = fn["Sessions"], adds = fn["Add to Cart"], checkout = fn["Checkout"], conv = fn["Conversion"];
  return [
    kpi("Users", b.users, "c", { hero: true, prior: p.users }),
    kpi("Sessions", sessions, "c", { prior: p.sessions }),
    kpi("Conversion Rate", cvr(conv, sessions), "%", { rate: true, prior: cvr(p.conversions, p.sessions) }),
    kpi("Add-to-Cart Rate", addToCartRate(adds, sessions), "%", { rate: true, prior: addToCartRate(p.addToCarts, p.sessions) }),
    kpi("Cart Abandonment", cartAbandonment(checkout, adds), "%", { rate: true, good: "down", prior: cartAbandonment(p.checkouts, p.addToCarts) }),
    kpi("Revenue / Visitor", revenuePerVisitor(b.revenue, sessions), "$2", { rate: true, prior: revenuePerVisitor(p.revenue, p.sessions) }),
    kpi("Engagement Rate", b.engagementRate, "%", { rate: true, prior: p.engagementRate }),
    kpi("Conversions", conv, "n", { prior: p.conversions }),
  ];
}

/** Ecommerce — derived from channel sales + customer mix (reconciles with those cards). */
export function ecomKpis(d: any): Kpi[] {
  const b = d.base, p = b.prior;
  const sales = sum(d.channels.data);
  const newC = d.custMix.data[0], retC = d.custMix.data[1], totalC = newC + retC;
  return [
    kpi("Total Sales", sales, "$", { hero: true, prior: p.sales }),
    kpi("Orders", b.orders, "n", { prior: p.orders }),
    kpi("Avg. Order Value", aov(sales, b.orders), "$", { rate: true, prior: aov(p.sales, p.orders) }),
    kpi("Conversion Rate", cvr(b.orders, b.visitors), "%", { rate: true, prior: cvr(p.orders, p.visitors) }),
    kpi("Revenue / Visitor", revenuePerVisitor(sales, b.visitors), "$2", { rate: true, prior: revenuePerVisitor(p.sales, p.visitors) }),
    kpi("Gross Margin", b.marginPct, "%", { rate: true, prior: p.marginPct }),
    kpi("Returning Rate", returningRate(retC, totalC), "%", { rate: true, prior: returningRate(p.returningC, p.newC + p.returningC) }),
    kpi("Refund Rate", refundRate(b.refunds, sales), "%", { rate: true, good: "down", prior: refundRate(p.refunds, p.sales) }),
  ];
}
