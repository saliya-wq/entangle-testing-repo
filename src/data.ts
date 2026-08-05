import { campaignKpis, ga4Kpis, ecomKpis, kpi, cpm, cpc } from "./lib/metrics";

export const CLIENTS = [
  { id: "aquapulse", name: "Aqua Pulse Spas", initials: "AP", f: 1 },
  { id: "cfyah", name: "Care For You at Home", initials: "CF", f: 0.42 },
  { id: "msplus", name: "MS Plus", initials: "MS", f: 1.8 },
];
export const AX = ["Jul 1", "Jul 5", "Jul 9", "Jul 13", "Jul 17", "Jul 21", "Jul 25", "Jul 29"];

export const DATA: Record<string, any> = {
  campaign: {
    // KPIs derived in metrics.campaignKpis() from the channel breakdown below.
    base: { reach: 578000, prior: { spend: 38184, conv: 623, rev: 152563, reach: 489830 } },
    mix: { labels: ["Meta Ads", "Google Ads"], data: [21760, 18410] },
    channels: [
      { ch: "Google Ads", spend: 18410, conv: 386, roas: 4.8, rev: 88368 },
      { ch: "Meta Ads", spend: 21760, conv: 312, roas: 4.1, rev: 89216 },
    ],
    trend: { spend: [2840, 3020, 3180, 3060, 3360, 3530, 3720, 3920], conv: [72, 80, 86, 82, 92, 101, 110, 120] },
  },
  fbAds: {
    kpis: [
      { l: "Amount Spent", v: 21760, fmt: "$", d: 6.3, dir: "up", hero: true },
      { l: "Reach", v: 482000, fmt: "c", d: 22.4, dir: "up" },
      { l: "Impressions", v: 1240000, fmt: "c", d: 18.1, dir: "up" },
      { l: "Link Clicks", v: 39210, fmt: "n", d: 17.1, dir: "up" },
      { l: "CTR", v: 3.16, fmt: "%", d: 4.2, dir: "up", rate: true },
      { l: "ROAS", v: 4.1, fmt: "x", d: 9.2, dir: "up", rate: true },
    ],
    base: { spend: 21760, impressions: 1240000, clicks: 39210, prior: { spend: 20400, impressions: 1180000, clicks: 37000 } },
    spend: { spend: [2280, 2410, 2540, 2460, 2680, 2810, 2960, 3120], results: [34, 38, 41, 39, 44, 49, 54, 58] },
    reach: { reach: [38000, 44000, 49000, 53000, 58000, 63000, 69000, 74000], impr: [92000, 108000, 121000, 133000, 146000, 160000, 175000, 190000] },
    campaigns: [
      { name: "Summer Lookbook", status: "on", spend: 6420, reach: 148000, ctr: 3.4, results: 98, roas: 5.1 },
      { name: "UGC Video — Rattan", status: "on", spend: 5210, reach: 132000, ctr: 3.9, results: 84, roas: 6.2 },
      { name: "Clearance — Catalogue", status: "on", spend: 3980, reach: 96000, ctr: 2.6, results: 52, roas: 3.4 },
      { name: "Retargeting — Dynamic", status: "on", spend: 3240, reach: 41000, ctr: 4.8, results: 58, roas: 6.9 },
      { name: "Prospecting — Lookalike", status: "off", spend: 2910, reach: 64000, ctr: 1.9, results: 20, roas: 2.2 },
    ],
    demo: { labels: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"], women: [3, 11, 14, 16, 13, 7], men: [2, 6, 8, 9, 6, 3] },
    placements: { labels: ["Feed", "Stories", "Reels", "Audience Net.", "Right Column"], data: [44, 20, 24, 8, 4] },
  },
  attribution: {
    kpis: [
      { l: "Attributed Revenue", v: 177584, fmt: "$", d: 16.4, dir: "up", hero: true },
      { l: "Total Ad Spend", v: 40170, fmt: "$", d: 5.2, dir: "up" },
      { l: "Blended ROAS · cash", v: 4.4, fmt: "x", d: 9.6, dir: "up", rate: true },
      { l: "Closes", v: 195, fmt: "n", d: 11.4, dir: "up" },
      { l: "Cost / Close", v: 206, fmt: "$", d: 5.1, dir: "down", rate: true, good: "down" },
      { l: "Revenue / Lead", v: 254, fmt: "$", d: 7.2, dir: "up", rate: true },
    ],
    channels: [
      { ch: "Google Ads", spend: 18410, rev: 88368, closes: 96, roas: 4.8 },
      { ch: "Meta Ads", spend: 21760, rev: 89216, closes: 99, roas: 4.1 },
    ],
    funnel: [
      { s: "Impressions", v: 1652000 }, { s: "Clicks", v: 53410 }, { s: "Leads", v: 698 },
      { s: "Bookings", v: 342 }, { s: "Closes", v: 195 },
    ],
    revenue: 177584,
    // Multi-touch journeys (conv sums to 195, rev to 177,584 — matches the headline).
    paths: [
      { path: ["Meta Ads", "Google Ads", "Direct"], conv: 34, rev: 31280 },
      { path: ["Google Ads", "Email", "Direct"], conv: 22, rev: 20240 },
      { path: ["Meta Ads", "Meta Ads", "Google Ads"], conv: 18, rev: 17640 },
      { path: ["Organic", "Google Ads"], conv: 20, rev: 18000 },
      { path: ["Google Ads"], conv: 16, rev: 12800 },
      { path: ["Meta Ads", "Referral", "Google Ads", "Direct"], conv: 12, rev: 13200 },
      { path: ["Email", "Meta Ads"], conv: 14, rev: 11200 },
      { path: ["Organic", "Email", "Direct"], conv: 10, rev: 8500 },
      { path: ["Referral", "Google Ads"], conv: 15, rev: 14250 },
      { path: ["Meta Ads"], conv: 18, rev: 14400 },
      { path: ["Direct"], conv: 8, rev: 6400 },
      { path: ["Google Ads", "Meta Ads"], conv: 8, rev: 9674 },
    ],
    geo: [
      { r: "Queensland", closes: 78, rev: 71034 }, { r: "New South Wales", closes: 52, rev: 47320 },
      { r: "Victoria", closes: 38, rev: 34600 }, { r: "Western Australia", closes: 16, rev: 14560 },
      { r: "South Australia", closes: 11, rev: 10010 },
    ],
    campaigns: [
      { name: "Performance Max", channel: "Google Ads", spend: 6200, closes: 34, rev: 31280, roas: 5.0 },
      { name: "Retargeting — Dynamic", channel: "Meta Ads", spend: 3240, closes: 26, rev: 29900, roas: 6.9 },
      { name: "Summer Lookbook", channel: "Meta Ads", spend: 6420, closes: 31, rev: 30690, roas: 4.8 },
      { name: "Search — Non-brand", channel: "Google Ads", spend: 5400, closes: 28, rev: 22400, roas: 4.1 },
      { name: "UGC Video", channel: "Meta Ads", spend: 5210, closes: 22, rev: 24200, roas: 4.6 },
    ],
  },
  cohort: {
    kpis: [
      { l: "Avg. LTV", v: 1840, fmt: "$", d: 9, dir: "up", rate: true, hero: true },
      { l: "LTV : CAC", v: 4.2, fmt: "x", d: 6, dir: "up", rate: true },
      { l: "Repeat Rate", v: 34, fmt: "%", d: 3, dir: "up", rate: true },
      { l: "Payback", v: 2.8, fmt: "mo", d: 5, dir: "down", rate: true, good: "down" },
      { l: "Orders / Customer", v: 1.6, fmt: "d1", d: 4, dir: "up", rate: true },
      { l: "Churn Rate", v: 18, fmt: "%", d: 2, dir: "down", rate: true, good: "down" },
    ],
    retention: { labels: ["Mo 0", "Mo 1", "Mo 2", "Mo 3", "Mo 4", "Mo 5", "Mo 6"], curve: [100, 68, 52, 44, 39, 35, 32] },
    ltv: [
      { ch: "Referral", ltv: 2680, cac: 60, ratio: 44.7 }, { ch: "Organic", ltv: 2240, cac: 120, ratio: 18.7 },
      { ch: "Paid Search", ltv: 1980, cac: 412, ratio: 4.8 }, { ch: "Paid Social", ltv: 1640, cac: 498, ratio: 3.3 },
    ],
    repeat: { labels: ["1 order", "2 orders", "3+ orders"], data: [1220, 412, 214] },
    cohorts: [
      { m: "Feb", size: 186, r1: 70, r3: 46, r6: 33 }, { m: "Mar", size: 204, r1: 72, r3: 48, r6: 34 },
      { m: "Apr", size: 178, r1: 68, r3: 44, r6: 31 }, { m: "May", size: 232, r1: 74, r3: 50, r6: 36 },
    ],
  },
  googleAds: {
    kpis: [{ l: "Cost", v: 18410, fmt: "$", d: 4.1, dir: "up", hero: true }, { l: "Impressions", v: 412000, fmt: "c", d: 9.2, dir: "up" }, { l: "Clicks", v: 14200, fmt: "n", d: 8.6, dir: "up" }, { l: "CTR", v: 3.45, fmt: "%", d: 2.1, dir: "up", rate: true }, { l: "Avg. CPC", v: 1.3, fmt: "$2", d: 3.4, dir: "down", rate: true, good: "down" }, { l: "Conversions", v: 386, fmt: "n", d: 12.4, dir: "up" }, { l: "Cost / Conv.", v: 47.7, fmt: "$", d: 5.2, dir: "down", rate: true, good: "down" }, { l: "ROAS", v: 4.8, fmt: "x", d: 11, dir: "up", rate: true }],
    base: { spend: 18410, impressions: 412000, clicks: 14200, prior: { spend: 17680, impressions: 405000 } },
    trend: { cost: [560, 610, 640, 600, 680, 720, 760, 800], conv: [38, 42, 45, 43, 48, 52, 56, 62] },
    campaigns: [{ name: "Search — Brand", status: "on", cost: 2100, clicks: 1800, ctr: 8.2, conv: 142, cpa: 14.8, roas: 9.6 }, { name: "Search — Non-brand", status: "on", cost: 5400, clicks: 3900, ctr: 3.1, conv: 96, cpa: 56.3, roas: 3.8 }, { name: "Performance Max", status: "on", cost: 6200, clicks: 4600, ctr: 2.9, conv: 104, cpa: 59.6, roas: 4.4 }, { name: "Shopping", status: "on", cost: 3410, clicks: 2600, ctr: 3.4, conv: 38, cpa: 89.7, roas: 3.1 }, { name: "Display — Remarketing", status: "off", cost: 1300, clicks: 1300, ctr: 0.9, conv: 6, cpa: 216.7, roas: 1.4 }],
    keywords: [{ kw: "outdoor spa", clicks: 1240, cpc: 1.85, conv: 88, qs: 9 }, { kw: "swim spa australia", clicks: 980, cpc: 2.1, conv: 64, qs: 8 }, { kw: "plunge pool cost", clicks: 760, cpc: 1.6, conv: 41, qs: 7 }, { kw: "hot tub sale", clicks: 640, cpc: 1.42, conv: 52, qs: 9 }, { kw: "spa pool installation", clicks: 520, cpc: 2.35, conv: 22, qs: 6 }],
    devices: { labels: ["Mobile", "Desktop", "Tablet"], data: [57, 37, 6] },
  },
  fbPage: {
    kpis: [{ l: "Page Followers", v: 48200, fmt: "c", d: 2.4, dir: "up", hero: true }, { l: "Net New Followers", v: 1120, fmt: "n", d: 14, dir: "up" }, { l: "Page Reach", v: 156000, fmt: "c", d: 9.6, dir: "up" }, { l: "Post Engagements", v: 18400, fmt: "n", d: 12.2, dir: "up" }, { l: "Engagement Rate", v: 4.2, fmt: "%", d: 1.1, dir: "up", rate: true }, { l: "Page Views", v: 8240, fmt: "n", d: 6.8, dir: "up" }],
    growth: { net: [110, 135, 120, 160, 145, 180, 175, 195], cum: [46200, 46410, 46630, 46910, 47150, 47510, 47850, 48200] },
    reach: { reach: [14000, 15600, 16800, 17400, 18900, 20100, 21600, 23000], impr: [38000, 41000, 44000, 47000, 52000, 56000, 61000, 66000] },
    engType: { labels: ["Reactions", "Comments", "Shares", "Saves"], data: [11800, 3400, 2200, 1000] },
    postReach: [9200, 12600, 8900, 14100, 10800, 15400, 11200, 16800],
    posts: [{ post: "Before / after — deck install", date: "Jul 28", reach: 16800, eng: 2140, rate: 12.7 }, { post: "Customer story: the Nolans", date: "Jul 22", reach: 15400, eng: 1780, rate: 11.6 }, { post: "Winter maintenance tips", date: "Jul 15", reach: 14100, eng: 1290, rate: 9.1 }, { post: "New arrivals — rattan range", date: "Jul 9", reach: 12600, eng: 1010, rate: 8 }],
    demo: { labels: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"], women: [4, 13, 17, 15, 11, 6], men: [2, 7, 9, 8, 5, 3] },
  },
  igOrganic: {
    kpis: [{ l: "Followers", v: 28400, fmt: "c", d: 3.1, dir: "up", hero: true }, { l: "Reach", v: 96000, fmt: "c", d: 14.2, dir: "up" }, { l: "Impressions", v: 210000, fmt: "c", d: 11.4, dir: "up" }, { l: "Profile Visits", v: 4200, fmt: "n", d: 9.8, dir: "up" }, { l: "Engagements", v: 12600, fmt: "n", d: 16, dir: "up" }, { l: "Engagement Rate", v: 5.1, fmt: "%", d: 1.4, dir: "up", rate: true }],
    growth: { net: [80, 95, 88, 120, 110, 140, 135, 150], cum: [27460, 27555, 27700, 27920, 28080, 28200, 28330, 28400] },
    reach: { reach: [9000, 10200, 11000, 11800, 12600, 13400, 14200, 15000], impr: [19000, 21000, 23000, 25000, 27000, 29000, 31000, 33000] },
    engType: { labels: ["Likes", "Comments", "Saves", "Shares"], data: [9800, 1600, 900, 300] },
    postReach: [8200, 11200, 9600, 13400, 10200, 14800, 12100, 16200],
    posts: [{ post: "Reel · Spa install timelapse", date: "Reel · Jul 27", reach: 24000, eng: 3100, rate: 12.9 }, { post: "Carousel · Backyard makeover", date: "Carousel · Jul 20", reach: 18600, eng: 2040, rate: 11 }, { post: "Photo · Sunset spa", date: "Photo · Jul 14", reach: 14200, eng: 1180, rate: 8.3 }, { post: "Reel · Customer review", date: "Reel · Jul 8", reach: 12800, eng: 1420, rate: 11.1 }],
    demo: { labels: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"], women: [5, 15, 18, 14, 9, 4], men: [3, 8, 9, 7, 4, 2] },
  },
  ga4: {
    // KPIs derived in metrics.ga4Kpis() from base + the funnel below.
    base: { users: 42800, sessions: 61200, engagementRate: 62, avgEngagementSec: 142, conversions: 1240, bounceRate: 38, revenue: 245626, prior: { users: 39411, sessions: 56772, conversions: 1133, revenue: 219000, addToCarts: 8600, checkouts: 2760, engagementRate: 60, bounceRate: 40 } },
    users: { nw: [1680, 1740, 1820, 1780, 1910, 2040, 2160, 2280], ret: [920, 980, 1040, 1010, 1120, 1180, 1250, 1320] },
    channels: [{ ch: "Organic Search", sess: 22100, cr: 5.9, rev: 76923 }, { ch: "Paid Search", sess: 14200, cr: 6.4, rev: 88368 }, { ch: "Paid Social", sess: 11800, cr: 4.1, rev: 54131 }, { ch: "Direct", sess: 8400, cr: 3.6, rev: 17094 }, { ch: "Referral", sess: 4700, cr: 3.1, rev: 9110 }],
    devices: { labels: ["Mobile", "Desktop", "Tablet"], data: [61, 33, 6] },
    pages: [{ p: "/", views: 18420, time: 96, bounce: 42 }, { p: "/spa-range", views: 12680, time: 168, bounce: 31 }, { p: "/swim-spas", views: 8940, time: 152, bounce: 34 }, { p: "/book-a-consult", views: 4180, time: 210, bounce: 18 }],
    geo: [{ c: "🇦🇺 Australia", sess: 52140, share: 100 }, { c: "🇳🇿 New Zealand", sess: 6280, share: 12 }, { c: "🇬🇧 United Kingdom", sess: 2640, share: 5 }],
    funnel: [{ s: "Sessions", v: 61200 }, { s: "Product Views", v: 34200 }, { s: "Add to Cart", v: 9800 }, { s: "Checkout", v: 3200 }, { s: "Conversion", v: 1240 }],
  },
  callTracking: {
    kpis: [{ l: "Total Calls", v: 486, fmt: "n", d: 12.4, dir: "up", hero: true }, { l: "Answered", v: 412, fmt: "n", d: 10.1, dir: "up" }, { l: "Missed", v: 74, fmt: "n", d: 6.2, dir: "down", good: "down" }, { l: "Miss Rate", v: 15, fmt: "%", d: 3.1, dir: "down", rate: true, good: "down" }, { l: "Avg. Duration", v: "4:12", fmt: "t", d: 4, dir: "up", rate: true }, { l: "Qualified Calls", v: 286, fmt: "n", d: 14.2, dir: "up" }],
    trend: { answered: [46, 50, 48, 54, 52, 58, 56, 62], missed: [10, 9, 11, 8, 10, 9, 8, 7] },
    byday: { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], answered: [78, 84, 80, 88, 72, 20, 10], missed: [14, 12, 15, 13, 10, 4, 2] },
    sources: [{ src: "Google Ads", calls: 186, ans: 162, qual: 128, cpc: 14.2 }, { src: "Organic", calls: 124, ans: 110, qual: 78, cpc: 0 }, { src: "Meta Ads", calls: 88, ans: 74, qual: 52, cpc: 16.8 }, { src: "Google Business", calls: 56, ans: 48, qual: 22, cpc: 0 }, { src: "Direct", calls: 32, ans: 18, qual: 6, cpc: 0 }],
    tiers: { labels: ["Hot lead", "Qualified", "Nurture", "Spam"], data: [112, 174, 142, 58] },
    recent: [{ caller: "07•• 412 883", src: "Google Ads", dur: "6:24", outcome: "Booked", sent: "Positive", tier: "Hot lead" }, { caller: "04•• 221 190", src: "Meta Ads", dur: "3:08", outcome: "Qualified", sent: "Positive", tier: "Qualified" }, { caller: "03•• 774 021", src: "Organic", dur: "1:12", outcome: "No answer", sent: "—", tier: "Nurture" }, { caller: "04•• 559 302", src: "Direct", dur: "0:22", outcome: "Spam", sent: "Negative", tier: "Spam" }, { caller: "07•• 883 114", src: "Google Ads", dur: "5:41", outcome: "Booked", sent: "Positive", tier: "Hot lead" }],
    keywords: [{ kw: "spa repair near me", calls: 64 }, { kw: "swim spa quote", calls: 52 }, { kw: "hot tub service", calls: 41 }, { kw: "plunge pool install", calls: 33 }],
  },
  pipeline: {
    kpis: [{ l: "Pipeline Value", v: 412000, fmt: "$", d: 14.1, dir: "up", hero: true }, { l: "Open Opportunities", v: 68, fmt: "n", d: 8.2, dir: "up" }, { l: "Win Rate", v: 42, fmt: "%", d: 3.6, dir: "up", rate: true }, { l: "Avg. Deal Size", v: 6200, fmt: "$", d: 5.1, dir: "up", rate: true }, { l: "Sales Cycle", v: 34, fmt: "day", d: 4.2, dir: "down", rate: true, good: "down" }, { l: "Expected Revenue", v: 128000, fmt: "$", d: 11, dir: "up" }],
    stages: [{ stage: "New", count: 82, value: 196000 }, { stage: "Contacted", count: 64, value: 158000 }, { stage: "Qualified", count: 42, value: 124000 }, { stage: "Proposal", count: 26, value: 92000 }, { stage: "Negotiation", count: 14, value: 64000 }, { stage: "Won", count: 42, value: 260400 }],
    wonlost: { won: [4, 6, 5, 7, 6, 8, 7, 9], lost: [8, 7, 9, 8, 7, 6, 7, 6] },
    bysource: [{ src: "Paid Search", opps: 28, won: 18, value: 112000, cac: 1022 }, { src: "Paid Social", opps: 22, won: 12, value: 74000, cac: 1813 }, { src: "Organic", opps: 12, won: 8, value: 52000, cac: 0 }, { src: "Referral", opps: 6, won: 4, value: 22000, cac: 0 }],
    deals: [{ co: "Coastline Interiors", src: "Paid Search", stage: "Proposal", value: 8400, age: 12 }, { co: "BuildRight Pty", src: "Organic", stage: "Negotiation", value: 14800, age: 22 }, { co: "Nest & Co", src: "Paid Social", stage: "Qualified", value: 4200, age: 6 }, { co: "Verdant Landscapes", src: "Referral", stage: "Proposal", value: 9600, age: 9 }, { co: "Alfresco Living", src: "Paid Search", stage: "Contacted", value: 3200, age: 3 }],
  },
  speedToLead: {
    kpis: [{ l: "Avg. Response Time", v: 8.4, fmt: "min", d: 22, dir: "down", rate: true, good: "down", hero: true }, { l: "Median Response", v: 3.2, fmt: "min", d: 18, dir: "down", rate: true, good: "down" }, { l: "% Under 5 min", v: 62, fmt: "%", d: 8, dir: "up", rate: true }, { l: "% Over 1 hour", v: 11, fmt: "%", d: 4, dir: "down", rate: true, good: "down" }, { l: "Leads Contacted", v: 642, fmt: "n", d: 9, dir: "up" }, { l: "Lead → Booking", v: 38, fmt: "%", d: 5, dir: "up", rate: true }],
    dist: { labels: ["<1 min", "1-5 min", "5-30 min", "30-60 min", "1-24 hr", ">24 hr"], data: [214, 184, 132, 58, 38, 16] },
    trend: { avg: [14, 12, 11, 9, 10, 8, 7, 6] },
    bysource: [{ src: "Website Form", avg: 6.2, under5: 68, book: 42 }, { src: "Meta Lead Ad", avg: 11.4, under5: 48, book: 31 }, { src: "Google Call Ext", avg: 2.1, under5: 88, book: 54 }, { src: "Landing Page", avg: 9.8, under5: 52, book: 35 }],
    impact: { labels: ["<5 min", "5-30 min", "30-60 min", "1-24 hr", ">24 hr"], book: [54, 38, 22, 12, 4] },
  },
  showRate: {
    kpis: [{ l: "Bookings", v: 342, fmt: "n", d: 12, dir: "up", hero: true }, { l: "Showed", v: 239, fmt: "n", d: 14, dir: "up" }, { l: "No-shows", v: 103, fmt: "n", d: 6, dir: "down", good: "down" }, { l: "Show Rate", v: 70, fmt: "%", d: 4, dir: "up", rate: true }, { l: "No-show Rate", v: 30, fmt: "%", d: 4, dir: "down", rate: true, good: "down" }, { l: "Show → Close", v: 34, fmt: "%", d: 3, dir: "up", rate: true }],
    trend: { show: [64, 66, 68, 67, 70, 71, 72, 73] },
    bysource: [{ src: "Paid Search", booked: 128, showed: 98, rate: 77 }, { src: "Paid Social", booked: 112, showed: 70, rate: 63 }, { src: "Organic", booked: 58, showed: 44, rate: 76 }, { src: "Referral", booked: 44, showed: 27, rate: 61 }],
    reasons: { labels: ["Forgot", "Rescheduled", "Price concern", "Not interested", "Unreachable"], data: [38, 26, 18, 12, 9] },
  },
  yoy: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    rev: { ty: [62, 58, 71, 66, 84, 92, 88, 79, 74, 81, 96, 110], ly: [54, 51, 60, 58, 70, 74, 72, 66, 61, 68, 80, 88] },
    orders: { ty: [41, 38, 47, 44, 55, 60, 58, 52, 49, 53, 63, 72], ly: [38, 35, 42, 40, 48, 51, 50, 46, 43, 47, 55, 62] },
    kpis: [{ l: "Revenue · YTD", v: 961000, fmt: "$", d: 19.8, dir: "up", hero: true }, { l: "Orders · YTD", v: 632, fmt: "n", d: 13.5, dir: "up" }, { l: "Avg. Order Value", v: 1520, fmt: "$", d: 5.6, dir: "up", rate: true }, { l: "Units Sold", v: 948, fmt: "n", d: 9.6, dir: "up" }, { l: "New Customers", v: 412, fmt: "n", d: 11, dir: "up" }, { l: "Repeat Rate", v: 34, fmt: "%", d: 3.2, dir: "up", rate: true }],
    category: [{ cat: "Swim Spas", ty: 452000, ly: 372000 }, { cat: "Plunge Pools", ty: 278000, ly: 224000 }, { cat: "Hot Tubs", ty: 158000, ly: 148000 }, { cat: "Accessories", ty: 73000, ly: 58000 }],
  },
  ecommerce: {
    // KPIs derived in metrics.ecomKpis() from channel sales + custMix below.
    base: { orders: 1846, visitors: 61200, marginPct: 62, refunds: 6420, prior: { sales: 244760, orders: 1647, visitors: 57000, newC: 1134, returningC: 554, refunds: 6560, marginPct: 60 } },
    sales: { gross: [7800, 8200, 8600, 8300, 9100, 9600, 10200, 10800], net: [7500, 7900, 8300, 8000, 8800, 9300, 9900, 10500] },
    channels: { labels: ["Online Store", "Retail Express POS", "Marketplace"], data: [186000, 74000, 24900] },
    products: [{ name: "Aurora Swim Spa 6.0", units: 64, revenue: 96000, stock: 12 }, { name: "Plunge Pro Compact", units: 98, revenue: 58800, stock: 8 }, { name: "Hydro Hot Tub 5-seat", units: 72, revenue: 43200, stock: 20 }, { name: "Cover & Cushion Kit", units: 420, revenue: 29400, stock: 140 }],
    custMix: { labels: ["New", "Returning"], data: [1240, 606] },
  },
  payments: {
    kpis: [{ l: "Gross Volume", v: 298400, fmt: "$", d: 15.2, dir: "up", hero: true }, { l: "Net Revenue", v: 284900, fmt: "$", d: 16.4, dir: "up" }, { l: "Successful", v: 1804, fmt: "n", d: 11.8, dir: "up" }, { l: "Failed", v: 96, fmt: "n", d: 4.1, dir: "down", good: "down" }, { l: "MRR", v: 42000, fmt: "$", d: 8.4, dir: "up" }, { l: "Churned MRR", v: 2100, fmt: "$", d: 3.2, dir: "down", good: "down" }],
    volume: { gross: [8200, 8600, 9000, 8700, 9500, 10000, 10600, 11200], refunds: [220, 180, 240, 200, 260, 190, 210, 180] },
    successFail: { labels: ["Successful", "Failed"], data: [1804, 96] },
    mrr: { mrr: [36000, 37000, 38000, 38500, 39500, 40200, 41000, 42000], churn: [1800, 2000, 1900, 2200, 2000, 2100, 1900, 2100] },
    geo: [{ r: "Queensland", cust: 486 }, { r: "New South Wales", cust: 342 }, { r: "Victoria", cust: 248 }, { r: "Western Australia", cust: 96 }, { r: "South Australia", cust: 68 }],
  },
  linkedin: {
    kpis: [{ l: "Followers", v: 8420, fmt: "c", d: 4.6, dir: "up", hero: true }, { l: "Impressions", v: 142000, fmt: "c", d: 12.4, dir: "up" }, { l: "Clicks", v: 3180, fmt: "n", d: 9.2, dir: "up" }, { l: "Engagement Rate", v: 4.8, fmt: "%", d: 1.2, dir: "up", rate: true }, { l: "Leads", v: 86, fmt: "n", d: 14, dir: "up" }, { l: "CTR", v: 2.24, fmt: "%", d: 3.1, dir: "up", rate: true }],
    trend: { impr: [14000, 15200, 16800, 16000, 18400, 19600, 20800, 21200], eng: [620, 680, 740, 710, 820, 890, 960, 1010] },
    seniority: { labels: ["Entry", "Senior", "Manager", "Director", "VP", "C-level"], data: [18, 26, 22, 16, 10, 8] },
    industry: { labels: ["Construction", "Health", "Property", "Retail", "Prof. Services"], data: [34, 22, 18, 14, 12] },
    posts: [{ post: "Case study: 4.4x ROAS for a spa retailer", date: "Jul 26", impr: 24000, eng: 1180, rate: 4.9 }, { post: "How we cut CPA by 32% in Q2", date: "Jul 18", impr: 18600, eng: 940, rate: 5.1 }, { post: "Hiring: Performance Marketing Lead", date: "Jul 11", impr: 14200, eng: 620, rate: 4.4 }, { post: "The measurement gap most agencies miss", date: "Jul 4", impr: 12800, eng: 710, rate: 5.5 }],
  },
  reports: {
    weekly: { period: "28 Jul – 3 Aug 2026", delivery: "Every Monday 8am · 3 recipients", icon: "📅" },
    monthly: { period: "July 2026", delivery: "1st of month · 4 recipients", icon: "📊" },
    quarterly: { period: "Q2 2026 · Apr–Jun", delivery: "Quarterly · leadership", icon: "📈" },
    kpi: { period: "July 2026", icon: "🎯", rows: [{ n: "Monthly Revenue", a: "$177.6K", t: "$200K", pct: 89, s: "On track" }, { n: "Blended ROAS", a: "4.4x", t: "4.0x", pct: 100, s: "Achieved" }, { n: "Conversions", a: "698", t: "750", pct: 93, s: "On track" }, { n: "Cost / Conversion", a: "$57.60", t: "≤ $60", pct: 100, s: "Achieved" }, { n: "Meta Leads", a: "312", t: "400", pct: 78, s: "At risk" }] },
  },
};

/* ---- Derive KPI cards from base inputs (single source of truth) ----
   Headline cards are computed from the same sub-data the pages render,
   so a card always reconciles with the table/chart beneath it. */
DATA.campaign.kpis = campaignKpis(DATA.campaign);
DATA.ga4.kpis = ga4Kpis(DATA.ga4);
DATA.ecommerce.kpis = ecomKpis(DATA.ecommerce);

// Essential ad efficiency cards (CPM / CPC) derived from spend & delivery.
{
  const g = DATA.googleAds.base;
  DATA.googleAds.kpis.push(kpi("CPM", cpm(g.spend, g.impressions), "$2", { rate: true, good: "down", prior: cpm(g.prior.spend, g.prior.impressions) }));
  const f = DATA.fbAds.base;
  DATA.fbAds.kpis.push(
    kpi("CPM", cpm(f.spend, f.impressions), "$2", { rate: true, good: "down", prior: cpm(f.prior.spend, f.prior.impressions) }),
    kpi("CPC", cpc(f.spend, f.clicks), "$2", { rate: true, good: "down", prior: cpc(f.prior.spend, f.prior.clicks) }),
  );
}
